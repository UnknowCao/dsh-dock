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
using System.Collections.Generic;
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

  /** JSON string literal via the serializer (escaping handled). */
  internal static string JsonStr(string value)
  {
    try
    {
      return new System.Web.Script.Serialization.JavaScriptSerializer()
        .Serialize(value ?? "");
    }
    catch { return "\"\""; }
  }

  /** Tail of a log file (tokens redacted), for the early-exit failure card. */
  internal static string ReadLogTail(string path, int maxChars)
  {
    try
    {
      if (string.IsNullOrEmpty(path) || !File.Exists(path)) return "";
      using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
        FileShare.ReadWrite | FileShare.Delete))
      {
        long start = Math.Max(0, fs.Length - maxChars);
        fs.Seek(start, SeekOrigin.Begin);
        int want = (int)(fs.Length - start);
        byte[] buf = new byte[want];
        int n = fs.Read(buf, 0, want);
        string s = System.Text.Encoding.UTF8.GetString(buf, 0, n);
        s = RedactTokens(s);
        if (s.Length > 260) s = s.Substring(s.Length - 260);
        return s.Trim();
      }
    }
    catch { return ""; }
  }

  /** Replace token values so crash dumps can never leak a session URL. */
  internal static string RedactTokens(string s)
  {
    try { return Regex.Replace(s, "token=[A-Za-z0-9_\\-]+", "token=…"); }
    catch { return s; }
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
        RunColdCard(cfg);
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
      Application.Run(new DshCard(cfg, false, CandidateSet.Single(cfg), false));
      return;
    }

    Diag("server dead -> cold card");
    RunColdCard(cfg);
  }

  /**
   * Cold start entry: run the T2 refresh first so a dsh installed since the
   * last server boot is already selectable, then let the card pick or start.
   */
  static void RunColdCard(LauncherConfig cfg)
  {
    bool refreshed = DshDockProgram.RunCandidateRefresh(cfg);
    CandidateSet cands = CandidateSet.Load(cfg, refreshed);
    bool stale = cands.HasRealList && !refreshed;
    Application.Run(new DshCard(cfg, true, cands, stale));
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

  /**
   * T2 candidate refresh: re-scan every installed dsh right before a cold
   * start by running the deployed node script (it writes candidates.json and
   * creates per-candidate batches — content-gated, never a rewrite of the
   * selection itself). Returns false when refresh cannot run (old ini, node
   * missing, timeout) so the caller can fall back to the stale list.
   */
  internal static bool RunCandidateRefresh(LauncherConfig cfg)
  {
    if (string.IsNullOrEmpty(cfg.Node) || string.IsNullOrEmpty(cfg.Refresh)
      || !File.Exists(cfg.Node) || !File.Exists(cfg.Refresh))
    {
      Diag("refresh skipped: node/script missing");
      return false;
    }
    try
    {
      var psi = new ProcessStartInfo(cfg.Node, "\"" + cfg.Refresh + "\"")
      {
        UseShellExecute = false,
        CreateNoWindow = true,
      };
      Diag("refresh start");
      Process p = Process.Start(psi);
      if (p == null) return false;
      if (!p.WaitForExit(8000))
      {
        try { p.Kill(); } catch { }
        Diag("refresh timeout");
        return false;
      }
      Diag("refresh exit=" + p.ExitCode);
      return p.ExitCode == 0;
    }
    catch (Exception e)
    {
      Diag("refresh FAIL: " + e.Message);
      return false;
    }
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
  // v0.3.3 multi-DSH selection support.
  public string Node;
  public string Candidates;
  public string State;
  public string Refresh;

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
      else if (key == "NODE") cfg.Node = value;
      else if (key == "CANDIDATES") cfg.Candidates = value;
      else if (key == "STATE") cfg.State = value;
      else if (key == "REFRESH") cfg.Refresh = value;
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

/** One selectable dsh installation (one baked batch file each). */
sealed class CandidateRow
{
  public string Id;
  public string Version;
  public string Kind;
  public string Path;
  public string Label;
  public string Batch;

  public string BatchPath(LauncherConfig cfg)
  {
    // cfg.Batch points at the default start-server.cmd (row 0). Alternates
    // live next to it under their own names.
    string dir = System.IO.Path.GetDirectoryName(cfg.Batch);
    if (string.IsNullOrEmpty(Batch)) return cfg.Batch;
    if (dir == null) return Batch;
    return System.IO.Path.Combine(dir, Batch);
  }
}

/**
 * v0.3.3 candidate set — parsed from candidates.json (written by the host at
 * activation and refreshed by the T2 script before each cold start). Rows are
 * pre-sorted by the writer (version desc, then kind, then path). A missing or
 * unreadable file degrades to a single pseudo-candidate pointing at the baked
 * default batch, so pre-v0.3.3 suites behave exactly as before.
 */
sealed class CandidateSet
{
  public List<CandidateRow> Rows = new List<CandidateRow>();
  public bool NpxFallback = false;
  /** True when rows came from a real candidates.json (not the pseudo default). */
  public bool HasRealList = false;

  /** Degraded single-candidate set (old ini / missing list / wait-mode card). */
  public static CandidateSet Single(LauncherConfig cfg)
  {
    var s = new CandidateSet();
    s.Rows.Add(new CandidateRow { Id = "default", Version = "", Kind = "default",
      Label = "默认", Batch = "" });
    return s;
  }

  /** Load candidates.json. refreshOk = the T2 refresh just ran successfully. */
  public static CandidateSet Load(LauncherConfig cfg, bool refreshOk)
  {
    var s = new CandidateSet();
    if (string.IsNullOrEmpty(cfg.Candidates) || !File.Exists(cfg.Candidates))
      return Single(cfg);
    try
    {
      string text = File.ReadAllText(cfg.Candidates, System.Text.Encoding.UTF8);
      var ser = new System.Web.Script.Serialization.JavaScriptSerializer();
      ser.MaxJsonLength = 1 << 20;
      var root = ser.DeserializeObject(text) as System.Collections.Generic.Dictionary<string, object>;
      if (root == null) return Single(cfg);
      if (root.ContainsKey("candidates"))
      {
        var list = root["candidates"] as object[];
        if (list != null)
        {
          foreach (object item in list)
          {
            var row = item as System.Collections.Generic.Dictionary<string, object>;
            if (row == null) continue;
            var r = new CandidateRow();
            if (row.ContainsKey("id")) r.Id = Convert.ToString(row["id"]);
            if (row.ContainsKey("version")) r.Version = Convert.ToString(row["version"]);
            if (row.ContainsKey("kind")) r.Kind = Convert.ToString(row["kind"]);
            if (row.ContainsKey("path")) r.Path = Convert.ToString(row["path"]);
            if (row.ContainsKey("label")) r.Label = Convert.ToString(row["label"]);
            if (row.ContainsKey("batch")) r.Batch = Convert.ToString(row["batch"]);
            r.Label = string.IsNullOrEmpty(r.Label) ? "默认" : r.Label;
            s.Rows.Add(r);
          }
        }
      }
      if (root.ContainsKey("npxFallback"))
      {
        var fb = root["npxFallback"];
        if (fb != null) s.NpxFallback = true;
      }
      if (s.Rows.Count == 0 && !s.NpxFallback)
      {
        // candidates.json exists but lists nothing and there is no npx
        // fallback — degrade to the baked default rather than a dead end.
        return Single(cfg);
      }
      s.HasRealList = true;
      return s;
    }
    catch (Exception e)
    {
      DshDockProgram.Diag("candidates parse FAIL: " + e.Message);
      return Single(cfg);
    }
  }

  /** Version of the last successful run (state file), or null. */
  public static string ReadLastVersion(LauncherConfig cfg)
  {
    if (string.IsNullOrEmpty(cfg.State) || !File.Exists(cfg.State)) return null;
    try
    {
      string text = File.ReadAllText(cfg.State, System.Text.Encoding.UTF8);
      var ser = new System.Web.Script.Serialization.JavaScriptSerializer();
      var root = ser.DeserializeObject(text) as System.Collections.Generic.Dictionary<string, object>;
      if (root != null && root.ContainsKey("lastVersion")) return Convert.ToString(root["lastVersion"]);
    }
    catch { }
    return null;
  }

  /** Persist the last successful (version, path) — called on a real open. */
  public static void RecordRun(LauncherConfig cfg, CandidateRow row)
  {
    if (row == null || string.IsNullOrEmpty(cfg.State)) return;
    try
    {
      string json = "{\"lastVersion\":" + DshDockProgram.JsonStr(row.Version)
        + ",\"lastPath\":" + DshDockProgram.JsonStr(row.Path)
        + ",\"updatedAt\":" + DateTime.UtcNow.Ticks + "}";
      string dir = System.IO.Path.GetDirectoryName(cfg.State);
      if (!string.IsNullOrEmpty(dir)) System.IO.Directory.CreateDirectory(dir);
      System.IO.File.WriteAllText(cfg.State, json, new System.Text.UTF8Encoding(false));
    }
    catch { }
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
  Process spawnProc = null;
  DateTime spawnAt = DateTime.MinValue;
  const int W = 340;
  const int HNormal = 184;
  const int HFail = 284;
  const int HZero = 204;
  const int WhaleW = 84;
  // v0.3.3 multi-DSH selection on the cold-start card.
  readonly CandidateSet cands;
  readonly bool stale;
  readonly List<CandidateRow> rows = new List<CandidateRow>();
  readonly ComboBox combo = new ComboBox();
  readonly Button npxBtn = new Button();
  readonly Button cancelBtn = new Button();
  readonly Label staleLbl = new Label();
  readonly Label autoLbl = new Label();
  int choiceMode = 0;        // 0 = none/single, 1 = picker, 2 = zero-candidate prompt
  int chosenIndex = -1;
  string serverBatch = null;
  bool chooseDone = false;
  bool comboOpen = false;
  DateTime chooseDeadline = DateTime.MaxValue;
  int lastHintSec = -1;
  const int ChooseSeconds = 5;

  public DshCard(LauncherConfig config, bool coldStart, CandidateSet cands, bool stale)
  {
    this.cfg = config;
    this.coldStart = coldStart;
    this.cands = cands ?? CandidateSet.Single(config);
    this.stale = stale;
    rows.AddRange(this.cands.Rows);
    DshDockProgram.Diag("card ctor coldStart=" + coldStart + " port=" + config.Port
      + " log=" + config.Log + " cands=" + rows.Count + " stale=" + stale);

    // Resolve the start target up front. The picker (mode 1) pauses spawn
    // until the user picks or the countdown fires; the zero-prompt (mode 2)
    // waits for an explicit npx/cancel click.
    if (coldStart)
    {
      if (rows.Count > 1) choiceMode = 1;
      else if (rows.Count == 0) choiceMode = 2;
    }
    if (choiceMode == 0 && rows.Count > 0)
    {
      chosenIndex = 0;
      serverBatch = rows[0].BatchPath(config);
      chooseDone = true;
    }

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
    closeBtn.Click += delegate { fadeOut = true; fadeTarget = 0f; };
    Controls.Add(closeBtn);

    SetupChoiceControls();

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
      TickChoice();
      Invalidate();
    };
    anim.Start();

    Shown += delegate
    {
      Region = RoundedRegion(Width, Height, 20);
      deadline = DateTime.UtcNow.AddSeconds(180);
      // Provisional first status; the poller's first probe (within ~60ms)
      // refines it — probing here would block this (UI) thread.
      if (choiceMode == 2)
      {
        Size = new Size(W, HZero);
        Region = RoundedRegion(W, HZero, 20);
        SetStatus("未找到任何已安装的 DSH");
        npxBtn.Visible = true;
        cancelBtn.Visible = true;
        // Fetching via npx is a deliberate, networked action — no countdown.
      }
      else
      {
        SetStatus(coldStart ? "正在启动" : "正在连接");
        if (choiceMode == 1)
        {
          combo.Visible = true;
          autoLbl.Visible = true;
          chooseDeadline = DateTime.UtcNow.AddSeconds(ChooseSeconds);
          lastHintSec = -1;
        }
      }
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

  /** Build the choice-phase controls (picker combo / npx prompt / stale hint). */
  void SetupChoiceControls()
  {
    combo.DropDownStyle = ComboBoxStyle.DropDownList;
    combo.FlatStyle = FlatStyle.Flat;
    combo.BackColor = Color.FromArgb(32, 37, 48);
    combo.ForeColor = ink;
    combo.Font = new Font("Segoe UI", 9f);
    combo.Location = new Point(26, 98);
    combo.Size = new Size(214, 24);
    combo.Visible = false;
    foreach (CandidateRow r in rows) combo.Items.Add(r.Label);
    if (rows.Count > 0)
    {
      string lastV = cands.HasRealList ? CandidateSet.ReadLastVersion(cfg) : null;
      int preselect = 0;
      if (lastV != null)
      {
        for (int i = 0; i < rows.Count; i++)
        {
          if (rows[i].Version == lastV) { preselect = i; break; }
        }
      }
      combo.SelectedIndex = preselect;
    }
    combo.DropDown += delegate
    {
      comboOpen = true;
      autoLbl.Text = "";
    };
    combo.DropDownClosed += delegate
    {
      comboOpen = false;
      // Opened but not picked: give the countdown a fresh window.
      if (choiceMode == 1 && !chooseDone)
      {
        chooseDeadline = DateTime.UtcNow.AddSeconds(ChooseSeconds);
        lastHintSec = -1;
        autoLbl.Text = "";
      }
    };
    combo.SelectionChangeCommitted += delegate { DoChoose(combo.SelectedIndex); };
    Controls.Add(combo);

    autoLbl.Location = new Point(246, 100);
    autoLbl.Size = new Size(68, 20);
    autoLbl.Font = monoFont;
    autoLbl.ForeColor = dim;
    autoLbl.TextAlign = ContentAlignment.MiddleRight;
    autoLbl.Visible = false;
    Controls.Add(autoLbl);

    npxBtn.Location = new Point(26, 158);
    npxBtn.Size = new Size(192, 30);
    npxBtn.FlatStyle = FlatStyle.Flat;
    npxBtn.FlatAppearance.BorderColor = Color.FromArgb(70, 76, 88);
    npxBtn.FlatAppearance.MouseOverBackColor = Color.FromArgb(40, 46, 58);
    npxBtn.BackColor = Color.FromArgb(32, 37, 48);
    npxBtn.ForeColor = ink;
    npxBtn.Font = new Font("Segoe UI", 9f);
    npxBtn.Text = "用 npx 拉取并启动(需联网)";
    npxBtn.Visible = false;
    npxBtn.Click += delegate
    {
      // cfg.Batch is the canonical npx-fallback batch when no candidate exists.
      serverBatch = cfg.Batch;
      chooseDone = true;
      npxBtn.Visible = false;
      cancelBtn.Visible = false;
      autoLbl.Text = "";
      SetStatus("正在通过 npx 获取最新版…");
    };
    Controls.Add(npxBtn);

    cancelBtn.Location = new Point(226, 158);
    cancelBtn.Size = new Size(88, 30);
    cancelBtn.FlatStyle = FlatStyle.Flat;
    cancelBtn.FlatAppearance.BorderColor = Color.FromArgb(70, 76, 88);
    cancelBtn.FlatAppearance.MouseOverBackColor = Color.FromArgb(40, 46, 58);
    cancelBtn.BackColor = Color.FromArgb(32, 37, 48);
    cancelBtn.ForeColor = ink;
    cancelBtn.Font = new Font("Segoe UI", 9f);
    cancelBtn.Text = "取消";
    cancelBtn.Visible = false;
    cancelBtn.Click += delegate { fadeOut = true; fadeTarget = 0f; };
    Controls.Add(cancelBtn);

    staleLbl.Location = new Point(10, 6);
    staleLbl.Size = new Size(320, 14);
    staleLbl.Font = monoFont;
    staleLbl.ForeColor = dim;
    staleLbl.Text = "版本列表可能已过期,可能未包含最新安装的 DSH";
    staleLbl.Visible = stale && cands.HasRealList && choiceMode != 2;
    Controls.Add(staleLbl);
  }

  /** 5s auto-start countdown for the picker (mode 1); no-op otherwise. */
  void TickChoice()
  {
    if (choiceMode != 1 || chooseDone || comboOpen) return;
    double left = (chooseDeadline - DateTime.UtcNow).TotalSeconds;
    if (left <= 0)
    {
      DoChoose(combo.SelectedIndex >= 0 ? combo.SelectedIndex : 0);
      return;
    }
    int secs = (int)Math.Ceiling(left);
    if (secs != lastHintSec)
    {
      lastHintSec = secs;
      autoLbl.Text = secs + " 秒后自动启动";
    }
  }

  /** Lock in the picker selection and allow the spawn path to proceed. */
  void DoChoose(int index)
  {
    if (chooseDone || choiceMode != 1) return;
    if (index < 0 || index >= rows.Count) index = 0;
    chosenIndex = index;
    serverBatch = rows[index].BatchPath(cfg);
    chooseDone = true;
    combo.Visible = false;
    autoLbl.Visible = false;
    DshDockProgram.Diag("chosen: " + rows[index].Label + " batch=" + serverBatch);
    SetStatus("正在启动 " + rows[index].Label);
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
    // Remember the version that really served the page — the next cold start
    // preselects it. Only recorded on success, never on a failed pick.
    if (cands.HasRealList && chosenIndex >= 0 && chosenIndex < rows.Count)
    {
      CandidateSet.RecordRun(cfg, rows[chosenIndex]);
    }
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
      // Multi-DSH / zero-prompt: the user picks (or the countdown fires)
      // before we may spawn — probes above still detect an external start.
      if (!chooseDone) return;
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
      // Early-exit detection: the chosen batch died without ever listening —
      // fail with the log tail instead of making the user wait out 180 s.
      if (spawned && !opened && spawnProc != null && spawnAt != DateTime.MinValue
        && (DateTime.UtcNow - spawnAt).TotalSeconds > 4)
      {
        try
        {
          if (spawnProc.HasExited && !Probe())
          {
            string tail = DshDockProgram.ReadLogTail(cfg.Log + ".err", 300);
            DshDockProgram.Diag("spawn exited early; err tail len=" + tail.Length);
            Fail("所选 DSH 启动后立即退出,未能监听端口 " + cfg.Port
              + "(依赖缺失或需其它启动方式)。");
            logline.Text = "日志尾部:" + (tail.Length == 0 ? "无" : tail)
              + "\n日志:" + cfg.Log;
            return;
          }
        }
        catch { }
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
    int statusY = (choiceMode == 2) ? 112 : 138;
    using (var brush = new SolidBrush(failing ? danger : dim))
    {
      g.DrawString(statusText, uiFont, brush,
        new RectangleF(0, statusY, Width, 30), sf);
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
    string target = serverBatch ?? cfg.Batch;
    DshDockProgram.Diag("spawn batch: " + target);
    var pi = new ProcessStartInfo("cmd.exe", "/c \"" + target + "\"")
    {
      UseShellExecute = false,
      CreateNoWindow = true,
    };
    try
    {
      spawnProc = Process.Start(pi);
      spawnAt = DateTime.UtcNow;
    }
    catch (Exception ex)
    {
      spawnProc = null;
      throw ex;
    }
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
