<sub>🌐 <a href="README.md">中文</a> · <b>English</b></sub>

<div align="center">

# DSH Dock (dsh-dock)

> *"Double-click the desktop whale, get full-screen DSH — then it lives in your notification area: status at a glance, restart in one click, no terminal, no `npx dsh web`, no digging through the process list for port 3080."*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue)
[![Runtime: DSH Web profile](https://img.shields.io/badge/Runtime-DSH%20Web%20profile-4c1)](https://github.com/deepseek-ai/deepseek-harness)
[![dsh-plugin](https://img.shields.io/badge/DSH%20plugin-%F0%9F%90%99-4c1)](https://github.com/topics/dsh-plugin)

**Collapses "open a terminal → type the command → paste the token → press F11 → hunt the process list to kill the server" into: double-click the whale to open, a tray whale that reports status, one-click server restart, and a two-step full exit. Single-file native exe, no build step on install, zero dependencies, loopback-only traffic.**

[Results and live tests](#results-and-live-tests) · [Quick start](#quick-start) · [What it can do](#what-it-can-do) · [Security boundaries](#security-boundaries) · [Verification and testing](#verification-and-testing)

</div>

---

<p align="center">

<img src="docs/screenshots/menu-en.png" width="400" alt="Sidebar More menu: ⚙ Settings / ⟳ Reload / Restart Server / ⏻ Full Exit">

<sub>One More menu in the sidebar: ⚙ Settings · ⟳ Reload · Restart Server · ⏻ Full Exit (two-step confirmation) — opening, restarting and exiting live in one place. The labels follow the harness display language (中文 shown in `menu.png`).</sub>

</p>

---

## What problem does it solve

If you use DeepSeek Harness daily, this probably repeats every day: open a terminal → `npx dsh web --no-open` → copy the token URL → paste it into a browser → press F11. Want a restart? `Get-NetTCPConnection -LocalPort 3080` to find the PID, `Stop-Process`, then do the whole thing again.

The problem isn't that any single step is hard — it's that **every step needs your hands**. "Restart" happens several times a day, yet it's buried in the process list.

DSH Dock collapses the ritual into three entry points plus one resident status seat:

- **One black whale icon on the desktop**: server running → opens full-screen directly; server down → starts it silently and opens the window once ready; after opening, the whale **settles into the system tray** (can be turned off in the settings page).
- **The tray whale (status entry, v0.4.0)**: hover shows "running / starting / stopped"; left-click reopens instantly; right-click menu = Open DSH · Restart Server · ☑ Start on boot · Full Exit.
- **One "More" menu in the sidebar**: ⚙ Settings (contains the "DSH Dock（启动器）" page) / ⟳ Reload · Refresh (UI only, server untouched) / Restart Server / ⏻ Full Exit (two-step confirm), all in one place.
- **Exit cleans up after itself**: Full Exit → the page closes itself → the server stops gracefully (whole-tree dispose) → sessions persist in real time; double-click the whale next time and pick up where you left off.

> The injected menu labels follow the harness display language (中文 / English toggles with the Settings → Language preference).

---

## Results and live tests

> Every image and number in this section is a **real run artifact**; the re-capture recipes live in the repo: [docs/screenshots/CAPTURE.md](docs/screenshots/CAPTURE.md).

### Desktop app (double-click to launch)

<p align="center"><img src="docs/screenshots/desktop-shortcut.png" width="112" alt='Desktop "DSH Harness" app icon (black whale)'></p>

After install, a "DSH Harness.exe" app appears on the desktop — **double-clicking it is the whole entry** (not a shortcut): server running → silent full-screen window; server down → the whale card takes over. The icon is the black whale (compiled into the exe; the shot above is the embedded 512×512 frame of `assets/dsh-dock.ico`, transparent background).

### Sidebar "More" menu (pops upward on click)

| Menu open | After clicking "Full Exit" once |
|---|---|
| ![Sidebar More menu](docs/screenshots/menu.png) | ![Full Exit two-step confirmation](docs/screenshots/menu-exit-armed.png) |

The right shot is step two of the accidental-click guard: the first click on "Full Exit" turns the button into 确认完全退出? ("Confirm full exit?"); a second click within 4 seconds executes.

Top to bottom: ⚙ **Settings** (opens the Settings dialog, which now contains the "DSH Dock（启动器）" page — tray residency / start-on-boot), ⟳ **Reload** (reloads the UI — same effect as Ctrl+Shift+R, server untouched), **Restart Server** (kills the listener, starts it again — closes old windows first, opens exactly one new one on ready), ⏻ **Full Exit** (two-step guard).

The "Full Exit" sequence: send the exit request → brief page linger → the window closes itself → the server stops silently. If the browser blocks the auto-close, an overlay explains it — close the tab manually once.

### Tray whale (resident status entry, v0.4.0)

After opening the window the whale stays in the notification area: hover tooltip shows the server state; left-click reopens instantly; **Restart Server / ☑ Start on boot** live on the right-click menu; the tray's "Full Exit" is a single click (the right-click itself is the intent; the sidebar keeps its two-step guard). A named mutex guarantees at most one icon at any time — whichever of double-click / boot autostart / tray arrives first stays.

![Tray right-click menu](docs/screenshots/tray-menu.png)

Tray right-click menu (top to bottom): Open DSH · Restart Server · ☑ Start on boot · Full Exit (single click).

### Settings page ("DSH Dock（启动器）" section in the Settings dialog, v0.4.0)

![Settings page](docs/screenshots/settings-section.png)

All plugin settings in one place: sidebar "More" → "Settings" → the "DSH Dock（启动器）" section in the left list → two toggles (**Tray residency** / **Start on boot**, each with a description). Their state stays in sync with the tray's right-click checkmark in real time.

### Cold-start card (double-click the whale while the server is down)

![Cold-start card](docs/screenshots/cold-card.png)

A dark translucent rounded glass card; the centered black whale is a breathing light (brightness pulsing 35%↔100% on a cosine curve — no progress bar, no caption). On failure the whale stops breathing, the text turns red, and the log path plus a close button appear.

> Screenshot provenance: the card is a real render of the **prebuilt launcher** (`assets/dsh-dock-launcher.exe`) under a demo config (temporary `launcher.ini` pointing at the real server on 3080 + a dead token line, read-only probing, no real log writes), captured in the "connecting" state. Re-capturable via `pwsh -File scripts/capture-demo-card.ps1`.

### Measured numbers (this machine)

> This machine = Windows 11 + 360 AV; method in [Verification and testing](#verification-and-testing). Engine-related timings will differ on other machines; the plugin's own overhead stays ~0.75s.

| Scenario | Measured | Notes |
|---|---|---|
| Server running, double-click the desktop app | **Edge new process ~0.6–1.5s** | Native exe direct (launch ~100ms + local HTTP verify ~10ms), no wscript layer |
| Server down, double-click the desktop app | **Branded card in ~0.3s**, window opens when the server is ready | Card and launcher are the same native exe (prebuilt and committed — no compile on install), no PowerShell engine wait |
| Server cold start to port ready | ~10–13s | dsh's own startup time (measured 10.6s / 13.2s) |
| "Full Exit" click to process actually gone | **~1–7s** | v0.3.7+ takes the graceful path (`ctx.appExit` whole-tree dispose, then natural exit; 7s is the watchdog ceiling, most exits land ~2s); hosts without `appExit` fall back to the hard kill |

---

## Quick start

Prerequisites: Windows 10/11 + the DSH `web` profile + Edge (falls back to the default browser if missing). No Node setup needed — the installer auto-detects a usable Node (≥ 22.19).

```bash
dsh plugin --profile web add github:UnknowCao/dsh-dock#v0.4.0
```

After restarting the server there is **nothing to do**: on activation the plugin extracts its parameters from the environment (its own listening port, Node path, start command); within ~2s the desktop gets "DSH Harness.exe" (black whale icon) and the sidebar gets the "More" menu. Daily routine: **double-click the whale to open, exit from the menu**. "Full Exit" now shuts the server down gracefully (the whole Cordis tree is disposed before a natural exit); hosts without `ctx.appExit` fall back to the legacy hard kill.

For customization (rename / different port), tell the agent:

```text
Rename the DSH desktop app to XX / install it on port 3081
```

Uninstall: delete the desktop `DSH Harness.exe` and `~\.dsh\launcher\`; remove the dependency and bundle entries from the profile. Uninstalling never deletes files automatically.

---

## What it can do

| Capability | Delivers | Trigger |
|---|---|---|
| One-click launch · fast path | Server running: silently opens **full-screen** (dedicated Edge app window, no card flash) | Double-click the desktop app |
| One-click launch · cold path | Branded card (breathing whale) → silent start → window on ready | Double-click the desktop app |
| Dedicated app window | Own Edge profile: not a tab in your main browser, 30-day login state | Automatic |
| Exit closes the window | Brief page linger, window closes, server stops silently, sessions persist in real time | Menu "Full Exit" ×2 |
| Guarded / race-free | Two-step Full Exit; double-click right after exit waits for the old process to die before cold-starting; single-instance lock on cold start; port-occupied-but-not-ready fails loudly instead of hanging | Automatic |
| Single file · no build · zero deps | The desktop entry is the **native exe itself** (not a shortcut); prebuilt and committed — installs need no csc; runtime talks to loopback only | Automatic |
| Install on activation | ~2s after activation the full suite lands, all parameters (port/Node/start command) auto-detected from the environment; content-compare idempotency, refreshed automatically on plugin upgrade | `dsh plugin add` + restart |
| Pick which DSH to start | With several dsh installs (global / npx cache / source), the cold-start card shows a picker; no click for 10s auto-uses the last successful version (or the highest); switching never rewrites any file; zero-candidate case offers a one-click npx fetch | Double-click the whale (multi-candidate) |
| Tray residency · status entry (v0.4.0) | After opening the window the whale stays in the notification area: hover shows "running / starting / stopped" status, left-click reopens instantly; closing the window never stops the server; a named mutex guarantees at most one icon ever | Automatic (on by default, toggle in the settings page) |
| One-click server restart (v0.4.0) | Kill the listener → wait the port dead → start again → auto-open on ready (replaces the old ~15s "exit and double-click" ritual with one click) | Tray right-click "重启服务器" |
| Boot autostart (v0.4.0, off by default) | Checking writes an HKCU Run entry: after login the whale sits in the tray with the server preheated in the background, **no window**; click the tray to open instantly | Tray right-click "开机自启" or the settings page |
| Plugin settings page (v0.4.0) | A proper section **inside the Settings dialog** (same seat other plugins' settings pages use): tray residency / boot autostart | Settings dialog → "DSH Dock（启动器）" |

---

## Compared to doing it by hand

| Scenario | By hand | dsh-dock |
|---|---|---|
| Open | Terminal `npx dsh web` + grab the token + paste into a browser | Double-click the icon — token grabbed, full-screen window opened |
| Window shape | Lost among browser tabs | Dedicated app window, straight to full screen (own profile) |
| Reload the UI | — (restart the whole server) | One menu click; server untouched |
| Exit | Hunt the process list for the PID, then kill | Menu "Full Exit" ×2 — window closes + server stops |
| Double-click again | May spawn a second server | Idempotent: already running → just open the window |

---

More plugins in the ecosystem indexes: [dsh-plugin topic](https://github.com/topics/dsh-plugin) · [Oh-My-DSH](https://github.com/NoWint/Oh-My-DSH) · [awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness).

---

## Security boundaries

- **Loopback only**: the exit endpoint `/launcher/api/stop` accepts local/trusted-origin + same-origin requests only; cross-site requests get a flat 403 — nothing exposed externally
- **Never touches session data**: exit relies on DSH's real-time persistence; the plugin does not read or write sessions in `$DSH_HOME`
- **No credentials read or sent**: the token only flows between the local log and the local Edge launch arguments
- **No wrong kills**: exit uses "own-PID kill + netstat fallback"; if the manifest points at some other process, it never acts
- **Zero lifecycle scripts on install**: `package.json` has no preinstall/install hooks — installing runs no arbitrary code; if a same-named desktop file exists that is **not** this plugin's, it refuses to overwrite and reports loudly
- **Full Exit has a two-step confirmation**; startup failures surface the reason plus the log path
- **No resident background service** (as of v0.4.0): the double-click chain remains a single native exe; the new **tray residency** is a visible, user-toggleable whale process (on by default) with loopback-only traffic and no credential access. Turning "tray residency" off fully restores the v0.3.x short-lived process model
- **Autostart writes only the per-user registry**: boot autostart is one `dsh-dock` value under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (pointing at the suite exe with `--boot`) — no admin rights needed, removing it deletes the entry
- **Settings routes share the same fence**: `/launcher/api/settings/{get,set}` goes through the same loopback/same-origin trust check as the exit endpoint; cross-site gets a 403

### Known limitations (stated up front, not defects)

- Windows only (macOS/Linux planned)
- Manually started server + a fresh Edge profile: no token in the log to grab — log in once with a token URL (login state lasts 30 days)
- "Full Exit" from an ordinary browser tab may be blocked from auto-closing → an overlay explains it; close manually once. Windows opened by the desktop app close automatically
- The injected web chrome follows the harness display language (Settings → Language); the native tray exe is not localized yet (Chinese labels; OS-driven context menu styling)
- Sidebar "Restart Server" needs the resident tray to execute (the host cannot restart its own death); when no tray is present it prompts you to double-click the whale first
- Tray "Restart Server" deliberately closes every dsh-dock window before booting — their tokens died with the old process, so a refresh cannot resurrect them

---

## File structure

```
dsh-dock/
├── index.js                 # Host: launcher_install tool + exit/settings/restart routes + baked launcher.ini/start-server.cmd + desktop exe placement
├── client.js                # Client: sidebar "More" menu + "DSH Dock（启动器）" settings page in the Settings dialog + exit auto-close + menu animation
├── cordis.patch.yml         # bundle patch: inserts the plugin row into the composition
├── package.json             # package manifest (name: dsh-dock)
├── regen-launcher.mjs       # maintenance: regenerate the launcher suite outside the harness
├── candidates.mjs           # shared: multi-DSH detection + suite materialization (activation + T2 refresh)
├── dsh-dock-refresh.mjs     # cold-start refresh script (T2, run by the exe via node; deployed next to candidates.json)
├── src/
│   └── DshDockLauncher.cs   # the launcher's single implementation: fast-path silent window + cold card + health gate + exit races + single-instance lock
├── assets/
│   ├── dsh-dock-launcher.exe # prebuilt launcher (output of scripts/build-launcher.ps1, committed — installs need no compiler)
│   ├── dsh-dock.ico         # desktop app whale icon (compiled into the exe)
│   └── whale.png            # card whale source bitmap (whiteness remap)
├── docs/
│   └── screenshots/
│       ├── desktop-shortcut.png  # desktop app icon close-up (black whale 512×512, transparent)
│       ├── menu.png         # sidebar "More" menu, real capture (main visual of the results section)
│       ├── menu-exit-armed.png   # "Full Exit" two-step confirmation state
│       ├── cold-card.png    # cold-start card, real capture (re-recorded under the demo config)
│       └── CAPTURE.md       # re-capture recipes (manual menu shots + scripted runs)
├── scripts/
│   ├── build-launcher.ps1   # compile src/DshDockLauncher.cs → assets/dsh-dock-launcher.exe (dev-time)
│   ├── capture-demo-card.ps1     # cold-card re-capture: demo ini + dead token → burst-shoot, pick the brightest whale phase
│   └── verify-health-gate.ps1    # regression: a dead token (401) must never open a window
├── LICENSE
├── README.md                # Chinese README (primary)
└── README.en.md             # this file
```

On install, generated under `~\.dsh\launcher\` (runtime artifacts, not committed):

`dsh-dock-launcher.exe` (the launcher itself), `launcher.ini` (runtime config read by the exe, base64 values), `start-server.cmd` (hidden spawner, waits for the port to be free before starting to avoid log truncation), `launcher.json` (host/port/desktop-dir/**trayPid** cache for the exit route and idempotency checks), `settings.json` (user settings: tray residency), `dsh-dock.ico`, `whale.png`, `.stopping` (exit-in-progress marker), `.starting.lock` (cold-start single-instance lock), `.restart.request` (sidebar Restart Server → tray executor), `stop.log` (append-only exit-lifecycle diagnostics), `dsh-server.log(.err)`, `edge-app-profile\` (the dedicated Edge profile for the full-screen window); the desktop receives `DSH Harness.exe` (a copy of the same binary). All of these are **generated/refreshed automatically** on plugin activation.

---

## Verification and testing

Spend 5 minutes self-verifying after install (every step lists its expected outcome):

1. **One-click open**: double-click the desktop "DSH Harness.exe" → with the server running, a full-screen window appears within 1–2s (no card), then the **whale settles into the notification area**.
2. **Tray**: hover the whale → tooltip "DSH 运行中 · 端口 3080"; left-click reopens instantly; right-click shows the four items (Open / Restart Server / ☑ Start on boot / Full Exit).
3. **Sidebar menu**: ☰ "More" → "Settings" opens the Settings dialog, which now contains the "DSH Dock（启动器）" page — its two toggles stay in sync with the tray's checkmark (change one, the other follows).
4. **Restart server**: sidebar or tray "Restart Server" → every dsh-dock window closes first → ~10–15s later exactly one new full-screen window opens.
5. **Cold start**: sidebar "Full Exit" ×2 (or one tray click) → wait until `Get-NetTCPConnection -LocalPort 3080 -State Listen` prints nothing → double-click the desktop app → breathing-whale card → server ready → full-screen window → card fades out.
6. **Race check**: during step 5's server startup (within ~10s), double-click once more → there should be exactly one server, one tray, and a usable window at the end.

---

## Implementation notes (for readers who want depth)

- **Single exe, single implementation**: fast path, cold card, health gate, exit races, single-instance lock — all compiled into the one file `src/DshDockLauncher.cs`. The retired .lnk→wscript→VBS→HTA four-layer chain (the same logic implemented three times — a historical bug nursery) is gone
- **Prebuilt + runtime config**: the exe is committed (`assets/dsh-dock-launcher.exe`), installs need no csc; every machine-specific path (logs/batch/Edge profile/markers/whale art) is baked into `launcher.ini` (base64 values — safe for Chinese usernames)
- **HTTP 200 health gate (with cookie semantics)**: DSH answers a valid token URL with **303 + Set-Cookie → /**; a browser follows it to 200. The gate replicates this chain with a CookieContainer — a stale token (bare 401) never opens a window
- **Exit/start race absorption**: while `.stopping` is fresh, the launcher waits for the port to die before cold-starting; `.starting.lock` single-instance lock prevents double starts, with a 60s crash takeover
- **Zero-blocking animation**: the TCP probe (a dead port blocks up to 700ms), the log scrape, and the health-gate HTTP all poll on a background thread — the UI thread only paints, so the breathing lamp stays smooth through the whole cold start, regardless of machine speed
- **Multi-DSH selection (one baked .cmd per candidate)**: candidates = global prefixes + npx cache (`_npx`) + source checkouts, sorted version → source → path; each candidate owns a batch file, switching only picks which one runs — **never rewrites any .cmd**; before a cold start the exe runs the T2 refresh script (~0.2s) so a dsh installed minutes ago is already selectable; a failed refresh falls back to the stale list flagged "may be outdated"
- **Fail loudly instead of hanging**: port occupied but the page never 200s → within ~24s it reports "the previous session may not have fully exited" + the log path
- **Tray residency (v0.4.0)**: `DshTray` lives in the same exe — after opening a window the process stays as the tray (with `--boot` it preheats the server silently, no window). The tray stamps its PID into `launcher.json` (`trayPid`); the sidebar exit kills it synchronously BEFORE the response (name-checked, so a recycled PID is never hit); a double-click while the tray is running does the fast-path open and exits — **zero IPC**; a `Local\dsh-dock-tray-<port>` named mutex guarantees at most one icon ever (across the suite and desktop copies)
- **Restart Server = the tray is the executor (v0.4.0)**: the sidebar item writes `.restart.request`; the resident tray polls it and runs the full restart sequence — the host cannot restart its own death. Restart closes every old dock window by `--user-data-dir` identity (their tokens died with the old process), then opens exactly one new window on ready
- **Window closing by identity, not bookkeeping (v0.4.0)**: WMI enumerates msedge command lines and closes every one carrying the dedicated Edge profile (graceful first, force-kill after a short grace) — a tray instance swap mid-session never orphans old windows
- **Graceful exit (v0.3.7+)**: `/launcher/api/stop` prefers `ctx.appExit` (whole-tree dispose, natural exit, 7s watchdog ceiling) and falls back to the hard kill only on hosts without `appExit`; every exit branch is recorded in the append-only `stop.log` (the cold-start batch cannot truncate it)
- **Install on activation**: ~2s after `apply()` the full suite lands — the port comes from **the own PID's LISTENING socket** (netstat, ~100ms), Node and the start command via probe chains; when already up to date, content comparison skips ahead (a few file reads — zero PowerShell, zero writes)
- **Diagnostics hook**: set `DSH_DOCK_DIAG=1` and the launcher appends its decision/crash trail to `%TEMP%\dsh-dock-diag.log` (zero overhead otherwise)
- After changing the `index.js` recipe or rebuilding the exe, regenerate the suite with `node regen-launcher.mjs`

---

## Acknowledgements and disclaimer

- This plugin depends on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) itself; the whale brand assets belong to it.

## License

[MIT](LICENSE)

---

<div align="center">

*Double-click the whale to open, exit from the menu 🐋*

</div>
