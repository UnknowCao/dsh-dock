<sub>🌐 <a href="README.md">中文</a> · <b>English</b></sub>

<div align="center">

# DSH Dock (dsh-dock)

> *"Double-click the desktop whale, get full-screen DSH — no terminal, no `npx dsh web`, no digging through the process list for port 3080."*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue)
[![Runtime: DSH Web profile](https://img.shields.io/badge/Runtime-DSH%20Web%20profile-4c1)](https://github.com/deepseek-ai/deepseek-harness)
[![dsh-plugin](https://img.shields.io/badge/DSH%20plugin-%F0%9F%90%99-4c1)](https://github.com/topics/dsh-plugin)

**Collapses "open a terminal → type the command → paste the token → press F11 → hunt the process list to kill the server" into one whale icon on your desktop plus one More menu in the sidebar. Single-file native exe, no build step on install, zero dependencies, loopback-only traffic.**

[Results and live tests](#results-and-live-tests) · [Quick start](#quick-start) · [What it can do](#what-it-can-do) · [Security boundaries](#security-boundaries) · [Verification and testing](#verification-and-testing)

</div>

---

<p align="center">

<img src="docs/screenshots/menu.png" width="400" alt="Sidebar More menu: ⚙ Settings / ⟳ Reload / ⏻ Full Exit">

<sub>One More menu in the sidebar: ⚙ Settings · ⟳ Reload · ⏻ Full Exit (two-step confirmation) — opening and exiting finally live in one place.</sub>

</p>

---

## What problem does it solve

If you use DeepSeek Harness daily, this probably repeats every day: open a terminal → `npx dsh web --no-open` → copy the token URL → paste it into a browser → press F11. Want a restart? `Get-NetTCPConnection -LocalPort 3080` to find the PID, `Stop-Process`, then do the whole thing again.

The problem isn't that any single step is hard — it's that **every step needs your hands**. "Restart" happens several times a day, yet it's buried in the process list.

DSH Dock collapses the ritual into two entry points:

- **One black whale icon on the desktop**: server running → opens full-screen directly; server down → starts it silently and opens the window once ready.
- **One "More" menu in the sidebar**: ⚙ Settings / ⟳ Reload / ⏻ Full Exit, all in one place.
- **Exit cleans up after itself**: click "Full Exit" → two-step confirm → the page closes itself → the server stops silently → sessions persist in real time; double-click the whale next time and pick up where you left off.

> The injected menu labels are Chinese for now — 更多 (More) · 设置 (Settings) · 重启 (Reload) · 完全退出 (Full Exit).

---

## Results and live tests

> All four screenshots and every number in this section are **real run artifacts**; the re-capture recipes live in the repo: [docs/screenshots/CAPTURE.md](docs/screenshots/CAPTURE.md).

### Desktop app (double-click to launch)

<p align="center"><img src="docs/screenshots/desktop-shortcut.png" width="112" alt='Desktop "DSH Harness" app icon (black whale)'></p>

After install, a "DSH Harness.exe" app appears on the desktop — **double-clicking it is the whole entry** (not a shortcut): server running → silent full-screen window; server down → the whale card takes over. The icon is the black whale (compiled into the exe; the shot above is the embedded 512×512 frame of `assets/dsh-dock.ico`, transparent background).

### Sidebar "More" menu (pops upward on click)

| Menu open | After clicking "Full Exit" once |
|---|---|
| ![Sidebar More menu](docs/screenshots/menu.png) | ![Full Exit two-step confirmation](docs/screenshots/menu-exit-armed.png) |

The right shot is step two of the accidental-click guard: the first click on "Full Exit" turns the button into 确认完全退出? ("Confirm full exit?"); a second click within 4 seconds executes.

Top to bottom: ⚙ **Settings** (opens the original settings dialog), ⟳ **Reload** (reloads the UI — same effect as Ctrl+Shift+R, server untouched), ⏻ **Full Exit** (two-step guard).

The "Full Exit" sequence: send the exit request → brief page linger → the window closes itself → the server stops silently. If the browser blocks the auto-close, an overlay explains it — close the tab manually once.

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
| "Full Exit" click to process actually dead | **~5.3s** | Mostly local PowerShell engine spawn (~4.5s, AV environment); the plugin's own script ~0.75s |

---

## Quick start

Prerequisites: Windows 10/11 + the DSH `web` profile + Edge (falls back to the default browser if missing). No Node setup needed — the installer auto-detects a usable Node (≥ 22.19).

```bash
dsh plugin --profile web add github:UnknowCao/dsh-dock#v0.3.0
```

After restarting the server there is **nothing to do**: on activation the plugin extracts its parameters from the environment (its own listening port, Node path, start command); within ~2s the desktop gets "DSH Harness.exe" (black whale icon) and the sidebar gets the "More" menu. Daily routine: **double-click the whale to open, exit from the menu**.

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
- **No resident process**: the double-click chain is a **single native exe** — probing, token verification, card, window-opening all in-process; zero wscript, zero PowerShell engine overhead (one short PowerShell call at install time only)

### Known limitations (stated up front, not defects)

- Windows only (macOS/Linux planned)
- Manually started server + a fresh Edge profile: no token in the log to grab — log in once with a token URL (login state lasts 30 days)
- "Full Exit" from an ordinary browser tab may be blocked from auto-closing → an overlay explains it; close manually once. Windows opened by the desktop app close automatically
- The injected menu labels are Chinese-only for now; localization is on the roadmap
- ~4.5s of the ~5.3s exit time is local PowerShell engine spawn (real-time AV scanning), not plugin logic

---

## File structure

```
dsh-dock/
├── index.js                 # Host: launcher_install tool + exit route + baked launcher.ini/start-server.cmd + desktop exe placement
├── client.js                # Client: sidebar "More" menu + exit auto-close + menu animation
├── cordis.patch.yml         # bundle patch: inserts the plugin row into the composition
├── package.json             # package manifest (name: dsh-dock)
├── regen-launcher.mjs       # maintenance: regenerate the launcher suite outside the harness
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

`dsh-dock-launcher.exe` (the launcher itself), `launcher.ini` (runtime config read by the exe, base64 values), `start-server.cmd` (hidden spawner, waits for the port to be free before starting to avoid log truncation), `launcher.json` (host/port/desktop-dir cache for the exit route and idempotency checks), `dsh-dock.ico`, `whale.png`, `.stopping` (exit-in-progress marker), `.starting.lock` (cold-start single-instance lock), `dsh-server.log(.err)`, `edge-app-profile\` (the dedicated Edge profile for the full-screen window); the desktop receives `DSH Harness.exe` (a copy of the same binary). All of these are **generated/refreshed automatically** on plugin activation.

---

## Verification and testing

Spend 3 minutes self-verifying after install (every step lists its expected outcome):

1. **One-click open**: double-click the desktop "DSH Harness.exe" → with the server running, a full-screen window appears within 1–2s (no card).
2. **Menu**: sidebar ☰ "More" → pop-in animation; "Settings" opens settings; "Reload" reloads the page, sessions intact.
3. **Cold start**: menu "Full Exit" ×2 → wait until `Get-NetTCPConnection -LocalPort 3080 -State Listen` prints nothing → double-click the desktop app → breathing-whale card → server ready → full-screen window → card fades out.
4. **Race check**: during step 3's server startup (within ~10s), double-click once more → there should be exactly one server and a usable window at the end.

---

## Implementation notes (for readers who want depth)

- **Single exe, single implementation**: fast path, cold card, health gate, exit races, single-instance lock — all compiled into the one file `src/DshDockLauncher.cs`. The retired .lnk→wscript→VBS→HTA four-layer chain (the same logic implemented three times — a historical bug nursery) is gone
- **Prebuilt + runtime config**: the exe is committed (`assets/dsh-dock-launcher.exe`), installs need no csc; every machine-specific path (logs/batch/Edge profile/markers/whale art) is baked into `launcher.ini` (base64 values — safe for Chinese usernames)
- **HTTP 200 health gate (with cookie semantics)**: DSH answers a valid token URL with **303 + Set-Cookie → /**; a browser follows it to 200. The gate replicates this chain with a CookieContainer — a stale token (bare 401) never opens a window
- **Exit/start race absorption**: while `.stopping` is fresh, the launcher waits for the port to die before cold-starting; `.starting.lock` single-instance lock prevents double starts, with a 60s crash takeover
- **Zero-blocking animation**: the TCP probe (a dead port blocks up to 700ms), the log scrape, and the health-gate HTTP all poll on a background thread — the UI thread only paints, so the breathing lamp stays smooth through the whole cold start, regardless of machine speed
- **Fail loudly instead of hanging**: port occupied but the page never 200s → within ~24s it reports "the previous session may not have fully exited" + the log path
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
