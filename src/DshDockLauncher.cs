// DshDockLauncher.cs — the single dsh-dock desktop launcher executable.
//
// One native exe replaces the old four-layer chain (.lnk -> wscript ->
// launch-dsh.vbs -> dsh-card.exe/HTA). Everything lives in this one file:
//
//   quick path  : server alive -> read the freshest token line, verify it
//                 really serves HTTP 200 (health gate with a cookie jar —
//                 DSH answers the token URL with 303 + Set-Cookie), then
//                 silently open the fullscreen Edge app window. No card UI.
//   exit race   : a fresh .stopping marker means the server is mid-shutdown;
//                 wait for the port to go down, then treat as cold start.
//   cold start  : show the breathing whale card, settle-probe, take the
//                 single-spawner lock, spawn start-server.cmd, poll, then
//                 open the window the moment the token URL serves 200.
//   stale server: port occupied by a non-responding / stale-token process
//                 (card did not spawn it) -> explicit failure with guidance
//                 instead of a 180 s silent wait.
//
// All paths (log, batch, profile, markers, whale png) come from
// %USERPROFILE%\.dsh\launcher\launcher.ini baked at install time, so the
// binary itself is build-independent — no csc at install, no VBS/HTA fallback.
//
// Compile (scripts/build-launcher.ps1):
//   csc /target:winexe /optimize+ /win32icon:assets/dsh-dock.ico
//       /r:System.Windows.Forms.dll /r:System.Drawing.dll src/DshDockLauncher.cs
//
// Language level: C# 5 (the Windows-bundled .NET Framework 4 csc).

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("dsh-dock-launcher")]
[assembly: System.Reflection.AssemblyProduct("dsh-dock")]

static class DshDockProgram
{
  public const int PortProbeMs = 700;    // TCP connect timeout for Probe()
  public const int QuickRetries = 10;    // quick path re-scrape attempts
  public const int QuickRetryMs = 500;
  public const int RaceWaitMs = 15000;   // exit/start race absorption window
  public const int MarkerFreshSec = 15;  // .stopping freshness (matches VBS)
  public const int SpawnLockTakeoverSec = 60; // crashed-spawner lock takeover
  public const int HttpTimeoutMs = 1500;
  public const int GateThrottleMs = 600; // health-gate probe throttle
  public const int GateFailLimit = 40;   // ~24s of non-200 -> explicit failure
  public const int ProbeThrottleMs = 400; // card TCP probe throttle — a dead
  // port blocks Probe() up to 700ms, so probing every 60ms tick would stall
  // the message pump and freeze the breathing lamp for the whole cold boot.

  /**
   * Diagnostics: set DSH_DOCK_DIAG=1 to append decision/crash traces to
   * %TEMP%\dsh-dock-diag.log. Zero cost when unset — keep for field support.
   */
  static readonly bool DiagOn = Environment.GetEnvironmentVariable("DSH_DOCK_DIAG") == "1";
  internal static void Diag(string m)
  {
    if (!DiagOn) return;
    try
    {
      File.AppendAllText(Path.Combine(Path.GetTempPath(), "dsh-dock-diag.log"),
        DateTime.Now.ToString("HH:mm:ss.fff") + " " + m + Environment.NewLine);
    }
    catch { }
  }

  [STAThread]
  static void Main()
  {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Diag("main start");
    Application.ThreadException += (s, e) => Diag("ThreadException: " + e.Exception);
    AppDomain.CurrentDomain.UnhandledException += (s, e) =>
      Diag("UnhandledException: " + e.ExceptionObject);

    LauncherConfig cfg;
    try
    {
      Diag("config read in");
      cfg = LauncherConfig.Read();
      Diag("config read ok url=" + cfg.Url);
    }
    catch (Exception e)
    {
      Diag("config read FAIL: " + e.Message);
      MessageBox.Show(e.Message, "DSH Harness",
        MessageBoxButtons.OK, MessageBoxIcon.Error);
      return;
    }

    bool alive = ServerAlive(cfg.Url);
    Diag("server alive: " + alive + " (url=" + cfg.Url + ")");
    if (alive)
    {
      // Exit/start race: a double-click right after 完全退出 must not open
      // the dying server. Wait the port down, then cold-start normally.
      if (MarkerActive(cfg.Stopping) && WaitForPortDown(cfg, RaceWaitMs))
      {
        Diag("exit race: port down -> cold card");
        Application.Run(new DshCard(cfg, coldStart: true));
        return;
      }
      // Quick path: open silently — no card UI — the moment the token URL
      // really serves the page. If the log only holds a stale token (server
      // still booting), retry a few times for a fresh line.
      for (int i = 0; i < QuickRetries; i++)
      {
        string url = ReadTokenUrl(cfg.Log);
        if (url != null && HttpReady(url))
        {
          Diag("quick open: " + url);
          LaunchEdge(url, cfg.Profile);
          return;
        }
        Thread.Sleep(QuickRetryMs);
      }
      // Server answers but never serves a valid token URL: show the card in
      // wait mode, which surfaces an explicit failure instead of waiting
      // silently for 180 s.
      Diag("quick path exhausted -> wait card");
      Application.Run(new DshCard(cfg, coldStart: false));
      return;
    }

    Diag("server dead -> cold card");
    Application.Run(new DshCard(cfg, coldStart: true));
  }

  // ── quick-path helpers ───────────────────────────────────────────────────

  /** Any HTTP answer (200, 401, ...) means the server process is alive. */
  internal static bool ServerAlive(string url)
  {
    Diag("ServerAlive in: " + url);
    try
    {
      var req = (HttpWebRequest)WebRequest.Create(url);
      req.Method = "GET";
      req.Timeout = 1200;
      req.ReadWriteTimeout = 1200;
      req.Proxy = null;
      req.AllowAutoRedirect = false;
      using (var resp = (HttpWebResponse)req.GetResponse())
      {
        Diag("ServerAlive out: status=" + (int)resp.StatusCode);
        return true;
      }
    }
    catch (WebException we)
    {
      Diag("ServerAlive out: WebException response=" + (we.Response != null));
      return we.Response != null;
    }
    catch (Exception e)
    {
      Diag("ServerAlive out: " + e.GetType().Name + " " + e.Message);
      return false;
    }
  }

  /** True while the stop route is shutting the server down (marker fresh). */
  internal static bool MarkerActive(string path)
  {
    try
    {
      long epochSec = long.Parse(File.ReadAllText(path).Trim());
      long nowSec = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
      return nowSec - epochSec < MarkerFreshSec;
    }
    catch { return false; }
  }

  /** Wait up to ms for the server port to actually go down. */
  internal static bool WaitForPortDown(LauncherConfig cfg, int ms)
  {
    DateTime deadline = DateTime.UtcNow.AddMilliseconds(ms);
    while (DateTime.UtcNow < deadline)
    {
      if (!ServerAlive(cfg.Url)) return true;
      Thread.Sleep(250);
    }
    return !ServerAlive(cfg.Url);
  }

  /** Freshest `dsh web: http://…?token=…` line from the server log, or null. */
  internal static string ReadTokenUrl(string logPath)
  {
    try
    {
      using (var fs = new FileStream(logPath, FileMode.Open, FileAccess.Read,
        FileShare.ReadWrite | FileShare.Delete))
      using (var rd = new StreamReader(fs))
      {
        MatchCollection ms = Regex.Matches(rd.ReadToEnd(),
          "dsh web: (http://[^ \\t\\r\\n]+)");
        if (ms.Count > 0) return ms[ms.Count - 1].Groups[1].Value;
      }
    }
    catch { }
    return null;
  }

  /**
   * Health gate: only a token URL that really serves the page may open the
   * window. DSH answers a VALID token URL with 303 + Set-Cookie -> "/"; the
   * cookie jar lets the auto-redirect land on 200 exactly like a browser.
   * A STALE token answers a plain 401 (no redirect) -> WebException -> false,
   * so the launcher keeps waiting for a fresh line instead of opening a fake
   * 401 window at a half-dead server.
   */
  internal static bool HttpReady(string url)
  {
    try
    {
      var req = (HttpWebRequest)WebRequest.Create(url);
      req.Method = "GET";
      req.Timeout = HttpTimeoutMs;
      req.ReadWriteTimeout = HttpTimeoutMs;
      req.Proxy = null;
      req.CookieContainer = new CookieContainer();
      using (var resp = (HttpWebResponse)req.GetResponse())
      {
        Diag("HttpReady " + url + " -> " + (int)resp.StatusCode);
        return resp.StatusCode == HttpStatusCode.OK;
      }
    }
    catch (Exception e)
    {
      var we = e as WebException;
      string detail = we != null && we.Response != null
        ? "status=" + (int)((HttpWebResponse)we.Response).StatusCode
        : e.GetType().Name + ": " + e.Message;
      Diag("HttpReady " + url + " -> FAIL (" + detail + ")");
      return false;
    }
  }

  /** Open the GUI as a fullscreen Edge app window (default browser fallback). */
  internal static void LaunchEdge(string url, string profile)
  {
    string edge = null;
    string[] cands = {
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        "Microsoft\\Edge\\Application\\msedge.exe"),
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
        "Microsoft\\Edge\\Application\\msedge.exe"),
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Microsoft\\Edge\\Application\\msedge.exe"),
    };
    foreach (string c in cands) if (File.Exists(c)) { edge = c; break; }
    if (edge != null)
    {
      string args = "--app=\"" + url + "\" --start-fullscreen --user-data-dir=\"" + profile
        + "\" --no-first-run --no-default-browser-check";
      Process.Start(edge, args);
    }
    else Process.Start(url);
  }
}

/** Bake-time configuration, read from %USERPROFILE%\.dsh\launcher\launcher.ini. */
sealed class LauncherConfig
{
  public string Url;
  public string Log;
  public string Batch;
  public string Profile;
  public string Stopping;
  public string Lock;
  public string Whale;

  public int Port
  {
    get
    {
      try { return new Uri(Url).Port; }
      catch { return 3080; }
    }
  }

  public static LauncherConfig Read()
  {
    string dir = Path.Combine(
      Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
      ".dsh", "launcher");
    string ini = Path.Combine(dir, "launcher.ini");
    if (!File.Exists(ini))
    {
      throw new InvalidOperationException(
        "缺少启动器配置 launcher.ini。请先安装 dsh-dock 插件并重启 dsh web。");
    }
    var cfg = new LauncherConfig();
    foreach (string raw in File.ReadAllLines(ini, System.Text.Encoding.UTF8))
    {
      // Defensive: strip a stray UTF-8 BOM before the first key.
      string line = raw.Trim().TrimStart('\uFEFF').Trim();
      if (line.Length == 0 || line.StartsWith("#")) continue;
      int sep = line.IndexOf('=');
      if (sep < 1) continue;
      string key = line.Substring(0, sep).Trim();
      string value = Decode(line.Substring(sep + 1).Trim(), key);
      if (key == "URL") cfg.Url = value;
      else if (key == "LOG") cfg.Log = value;
      else if (key == "BATCH") cfg.Batch = value;
      else if (key == "PROFILE") cfg.Profile = value;
      else if (key == "STOPPING") cfg.Stopping = value;
      else if (key == "LOCK") cfg.Lock = value;
      else if (key == "WHALE") cfg.Whale = value;
    }
    if (string.IsNullOrEmpty(cfg.Url) || string.IsNullOrEmpty(cfg.Log)
      || string.IsNullOrEmpty(cfg.Batch) || string.IsNullOrEmpty(cfg.Profile))
    {
      throw new InvalidOperationException("launcher.ini 缺少必要配置项 (URL/LOG/BATCH/PROFILE)。");
    }
    return cfg;
  }

  static string Decode(string value, string key)
  {
    try
    {
      return System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(value));
    }
    catch
    {
      throw new InvalidOperationException("launcher.ini 的 " + key + " 值不是合法 Base64。");
    }
  }
}

/** Breathing-whale cold-start card (also the wait/failure surface). */
sealed class DshCard : Form
{
  readonly LauncherConfig cfg;
  readonly bool coldStart;
  readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer();
  Thread poller = null;
  volatile bool pollerStop = false;
  readonly Label logline = new Label();
  readonly Button closeBtn = new Button();
  readonly Font uiFont = new Font("Segoe UI Light", 11f);
  readonly Font monoFont = new Font("Consolas", 8.5f);
  readonly Color bgTop = Color.FromArgb(28, 33, 42);
  readonly Color bgBot = Color.FromArgb(20, 24, 31);
  readonly Color ink = Color.FromArgb(200, 206, 216);
  readonly Color dim = Color.FromArgb(128, 136, 148);
  readonly Color danger = Color.FromArgb(240, 110, 100);
  Bitmap whaleBmp = null;
  System.Drawing.Imaging.ImageAttributes whaleAttrs = null;
  System.Drawing.Imaging.ColorMatrix whaleMatrix = null;
  Brush textInk = null;
  Brush textDanger = null;
  Pen borderPen = null;
  string statusText = "正在启动";
  float breatheT = 0f;
  float fadeTarget = 0.90f;
  int warmTicks = 0;
  DateTime deadline;
  DateTime lastHttpCheck = DateTime.MinValue;
  DateTime lastProbe = DateTime.MinValue;
  bool opened = false;
  bool failing = false;
  bool fadeOut = false;
  bool spawned = false;
  int deadStreak = 0;
  int gateFailStreak = 0;
  const int W = 340;
  const int HNormal = 184;
  const int HFail = 284;
  const int WhaleW = 84;

  public DshCard(LauncherConfig config, bool coldStart)
  {
    this.cfg = config;
    this.coldStart = coldStart;
    DshDockProgram.Diag("card ctor coldStart=" + coldStart + " port=" + config.Port
      + " log=" + config.Log);

    FormBorderStyle = FormBorderStyle.None;
    StartPosition = FormStartPosition.CenterScreen;
    ShowInTaskbar = false;
    TopMost = true;
    BackColor = bgBot;
    DoubleBuffered = true;
    SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint
      | ControlStyles.UserPaint, true);
    Size = new Size(W, HNormal);
    Opacity = 0;

    textInk = new SolidBrush(ink);
    textDanger = new SolidBrush(danger);
    borderPen = new Pen(Color.FromArgb(36, 255, 255, 255), 1f);

    whaleMatrix = new System.Drawing.Imaging.ColorMatrix();
    whaleAttrs = new System.Drawing.Imaging.ImageAttributes();
    whaleAttrs.SetColorMatrix(whaleMatrix);
    PreRenderWhale();

    logline.Location = new Point(48, 148);
    logline.Size = new Size(244, 40);
    logline.Font = monoFont;
    logline.ForeColor = dim;
    logline.Visible = false;
    Controls.Add(logline);

    closeBtn.Location = new Point(120, 198);
    closeBtn.Size = new Size(100, 28);
    closeBtn.FlatStyle = FlatStyle.Flat;
    closeBtn.FlatAppearance.BorderColor = Color.FromArgb(70, 76, 88);
    closeBtn.FlatAppearance.MouseOverBackColor = Color.FromArgb(40, 46, 58);
    closeBtn.BackColor = Color.FromArgb(32, 37, 48);
    closeBtn.ForeColor = ink;
    closeBtn.Font = new Font("Segoe UI", 9f);
    closeBtn.Text = "关闭";
    closeBtn.Visible = false;
    closeBtn.Click += delegate { fadeTarget = 0f; };
    Controls.Add(closeBtn);

    anim.Interval = 16;
    anim.Tick += delegate
    {
      if (warmTicks < 10) { warmTicks++; Invalidate(); return; }
      breatheT += 0.011f;
      if (breatheT > 1f) breatheT -= 1f;
      float d = fadeTarget - (float)Opacity;
      if (Math.Abs(d) > 0.003f) Opacity = Math.Max(0, Math.Min(1, Opacity + d * 0.10f));
      else Opacity = fadeTarget;
      if (fadeOut && Opacity <= 0.015) Close();
      Invalidate();
    };
    anim.Start();

    Shown += delegate
    {
      Region = RoundedRegion(Width, Height, 20);
      deadline = DateTime.UtcNow.AddSeconds(180);
      // Provisional first status; the poller's first probe (within ~60ms)
      // refines it — probing here would block this (UI) thread.
      SetStatus(coldStart ? "正在启动" : "正在连接");
      poller = new Thread(PollerLoop);
      poller.IsBackground = true;
      poller.Name = "dsh-dock-poller";
      poller.Start();
    };
  }

  void PreRenderWhale()
  {
    try
    {
      string whalePath = cfg.Whale;
      if (string.IsNullOrEmpty(whalePath) || !File.Exists(whalePath)) return;
      Image src;
      using (var fs = new FileStream(whalePath, FileMode.Open,
        FileAccess.Read, FileShare.ReadWrite))
      {
        src = new Bitmap(fs);
      }
      int h = (int)(WhaleW * 17.04 / 23.16);
      whaleBmp = new Bitmap(WhaleW, h);
      using (var g = Graphics.FromImage(whaleBmp))
      {
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var attrs = new System.Drawing.Imaging.ImageAttributes();
        var map = new System.Drawing.Imaging.ColorMap[1];
        map[0] = new System.Drawing.Imaging.ColorMap();
        map[0].OldColor = Color.Black;
        map[0].NewColor = Color.FromArgb(225, 230, 240);
        attrs.SetRemapTable(map);
        g.DrawImage(src, new Rectangle(0, 0, WhaleW, h), 0, 0, src.Width, src.Height,
          GraphicsUnit.Pixel, attrs);
      }
      src.Dispose();
    }
    catch { whaleBmp = null; }
  }

  /** Marshal a UI update onto the message loop (safe once the form is shown). */
  void Ui(MethodInvoker a)
  {
    try { if (!IsDisposed) BeginInvoke(a); }
    catch (ObjectDisposedException) { }
    catch (InvalidOperationException) { }
  }

  void SetStatus(string t)
  {
    Ui(delegate { statusText = t; failing = false; Invalidate(); });
  }

  /** Re-read the log, health-gate the token URL, and open on success. */
  bool TryOpenFromLog()
  {
    string url = DshDockProgram.ReadTokenUrl(cfg.Log);
    if (url == null) return false;
    if (!DshDockProgram.HttpReady(url)) return false;
    Open(url);
    return true;
  }

  void Open(string url)
  {
    DshDockProgram.Diag("card open: " + url);
    opened = true;
    pollerStop = true;
    TryClearSpawnLock();
    DshDockProgram.LaunchEdge(url, cfg.Profile);
    Ui(delegate
    {
      statusText = "已就绪";
      fadeOut = true;
      fadeTarget = 0f;
      Invalidate();
    });
  }

  /**
   * All blocking I/O — the TCP probe (a dead port blocks up to 700ms), the
   * log scrape, and the health-gate HTTP call (up to 1.5s) — runs on this
   * background thread; the UI thread only paints. These used to run inside
   * a WinForms timer tick, freezing the message pump and stuttering the
   * breathing lamp on every poll — machine-independent, because a kernel
   * connect timeout is not CPU work.
   */
  void PollerLoop()
  {
    while (!pollerStop)
    {
      try { PollOnce(); }
      catch (Exception ex) { DshDockProgram.Diag("poller tick FAIL: " + ex.Message); }
      if (pollerStop) break;
      Thread.Sleep(60);
    }
    DshDockProgram.Diag("poller exit");
  }

  void PollOnce()
  {
    if (failing || opened) { pollerStop = true; return; }
    if (coldStart)
    {
      // Probe at most every ProbeThrottleMs: a dead port blocks the TCP
      // connect up to 700ms, and doing that on every 60ms tick would freeze
      // the breathing animation for the whole server boot.
      bool probed = (DateTime.UtcNow - lastProbe).TotalMilliseconds
        >= DshDockProgram.ProbeThrottleMs;
      bool up = false;
      if (probed)
      {
        lastProbe = DateTime.UtcNow;
        up = Probe();
      }
      if (up)
      {
        deadStreak = 0;
        if ((DateTime.UtcNow - lastHttpCheck).TotalMilliseconds
          >= DshDockProgram.GateThrottleMs)
        {
          lastHttpCheck = DateTime.UtcNow;
          if (TryOpenFromLog()) return;
          statusText = "正在连接";
        }
        return;
      }
      if (probed && !spawned)
      {
        // Settle guard (port must stay down) PLUS a single-spawner lock: the
        // cold boot keeps the port dead ~10s+, so settle checks alone cannot
        // stop a second double-click from spawning a duplicate server.
        deadStreak++;
        if (deadStreak >= 3)
        {
          spawned = true;
          if (TryTakeSpawnLock())
          {
            statusText = "首次启动可能稍久";
            try { StartServer(); } catch (Exception ex) { Fail(ex.Message); }
          }
        }
        return;
      }
      if (DateTime.UtcNow > deadline)
      {
        Fail("服务器在 180 秒内未就绪(端口 " + cfg.Port
          + ")。若服务器由手动命令启动,请直接用浏览器打开 " + cfg.Url
          + "。日志:" + cfg.Log);
      }
    }
    else
    {
      // Wait mode: the server answers HTTP but never serves a valid token
      // URL. Keep polling with the health gate, but surface an explicit
      // failure (~24 s) instead of a silent 180 s wait — and tailor the
      // guidance to the port's actual state (occupied vs. already gone).
      if (!opened && (DateTime.UtcNow - lastHttpCheck).TotalMilliseconds
        >= DshDockProgram.GateThrottleMs)
      {
        lastHttpCheck = DateTime.UtcNow;
        if (TryOpenFromLog()) return;
        gateFailStreak++;
        if (gateFailStreak >= DshDockProgram.GateFailLimit)
        {
          if (Probe())
          {
            Fail("端口 " + cfg.Port + " 已被占用,但 DSH 页面未就绪(上一次会话可能未完全退出,"
              + "或服务器由手动命令启动)。请结束占用 " + cfg.Port + " 端口的进程,"
              + "或直接用浏览器打开 " + cfg.Url + "。日志:" + cfg.Log);
          }
          else
          {
            Fail("服务器已停止响应。请再次双击以重新启动。日志:" + cfg.Log);
          }
        }
      }
    }
  }

  void Fail(string msg)
  {
    failing = true;
    pollerStop = true;
    Ui(delegate
    {
      statusText = "启动失败:" + msg;
      Size = new Size(W, HFail);
      Region = RoundedRegion(Width, Height, 20);
      logline.Text = "日志:" + cfg.Log;
      logline.Visible = true;
      closeBtn.Visible = true;
      Invalidate();
    });
  }

  protected override void OnFormClosed(FormClosedEventArgs e)
  {
    pollerStop = true;
    base.OnFormClosed(e);
  }

  protected override void OnPaint(PaintEventArgs e)
  {
    var g = e.Graphics;
    g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

    using (var bgGrad = new System.Drawing.Drawing2D.LinearGradientBrush(
      new Rectangle(0, 0, Width, Height), bgTop, bgBot, 90f))
    {
      var oldClip = g.Clip;
      g.SetClip(RoundedPath(0, 0, Width, Height, 20));
      g.FillRectangle(bgGrad, 0, 0, Width, Height);
      g.Clip = oldClip;
    }

    g.DrawPath(borderPen, RoundedPath(0.5f, 0.5f, Width - 1f, Height - 1f, 19f));

    if (whaleBmp != null)
    {
      int whaleH = whaleBmp.Height;
      int wx = (Width - WhaleW) / 2;
      int wy = 32;
      if (failing) g.DrawImage(whaleBmp, wx, wy);
      else
      {
        float lamp = (float)(0.35 + 0.65 * (0.5 - 0.5 * Math.Cos(breatheT * 2 * Math.PI)));
        whaleMatrix.Matrix33 = lamp;
        whaleAttrs.SetColorMatrix(whaleMatrix);
        g.DrawImage(whaleBmp, new Rectangle(wx, wy, WhaleW, whaleH),
          0, 0, WhaleW, whaleH, GraphicsUnit.Pixel, whaleAttrs);
      }
    }

    var sf = new StringFormat();
    sf.Alignment = StringAlignment.Center;
    sf.LineAlignment = StringAlignment.Center;
    using (var brush = new SolidBrush(failing ? danger : dim))
    {
      g.DrawString(statusText, uiFont, brush, new RectangleF(0, 138, Width, 26), sf);
    }
  }

  static System.Drawing.Drawing2D.GraphicsPath RoundedPath(float x, float y, float w, float h, float r)
  {
    var p = new System.Drawing.Drawing2D.GraphicsPath();
    p.AddArc(x, y, r, r, 180, 90);
    p.AddArc(x + w - r, y, r, r, 270, 90);
    p.AddArc(x + w - r, y + h - r, r, r, 0, 90);
    p.AddArc(x, y + h - r, r, r, 90, 90);
    p.CloseFigure();
    return p;
  }

  bool Probe()
  {
    string host = "127.0.0.1";
    try { host = new Uri(cfg.Url).Host; } catch { }
    try
    {
      using (var c = new System.Net.Sockets.TcpClient())
      {
        var ok = c.BeginConnect(host, cfg.Port, null, null);
        bool done = ok.AsyncWaitHandle.WaitOne(DshDockProgram.PortProbeMs);
        if (done && c.Connected) { c.Close(); return true; }
      }
    }
    catch { }
    return false;
  }

  void StartServer()
  {
    var pi = new ProcessStartInfo("cmd.exe", "/c \"" + cfg.Batch + "\"")
    {
      UseShellExecute = false,
      CreateNoWindow = true,
    };
    Process.Start(pi);
  }

  /** Single-spawner lock: of N racing launchers exactly one starts the server;
   *  a crashed spawner's lock is taken over after 60 s. */
  bool TryTakeSpawnLock()
  {
    string lp = cfg.Lock;
    try
    {
      using (var fs = new FileStream(lp, FileMode.CreateNew, FileAccess.Write))
      {
        byte[] b = System.Text.Encoding.UTF8.GetBytes(DateTime.UtcNow.Ticks.ToString());
        fs.Write(b, 0, b.Length);
      }
      return true;
    }
    catch { }
    try
    {
      var fi = new FileInfo(lp);
      if (fi.Exists && DateTime.UtcNow - fi.LastWriteTimeUtc
        > TimeSpan.FromSeconds(DshDockProgram.SpawnLockTakeoverSec))
      {
        try { File.Delete(lp); } catch { }
        try
        {
          using (var fs = new FileStream(lp, FileMode.CreateNew, FileAccess.Write))
          {
            byte[] b = System.Text.Encoding.UTF8.GetBytes(DateTime.UtcNow.Ticks.ToString());
            fs.Write(b, 0, b.Length);
          }
          return true;
        }
        catch { }
      }
    }
    catch { }
    return false;
  }

  void TryClearSpawnLock()
  {
    try { if (File.Exists(cfg.Lock)) File.Delete(cfg.Lock); } catch { }
  }

  static Region RoundedRegion(int w, int h, int r)
  {
    var path = new System.Drawing.Drawing2D.GraphicsPath();
    path.AddArc(0, 0, r, r, 180, 90);
    path.AddArc(w - r, 0, r, r, 270, 90);
    path.AddArc(w - r, h - r, r, r, 0, 90);
    path.AddArc(0, h - r, r, r, 90, 90);
    path.CloseFigure();
    return new Region(path);
  }
}
