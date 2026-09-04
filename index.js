/**
 * dsh-dock — one-click desktop launcher for DSH Harness (Windows).
 *
 * Architecture (v2, single native entry):
 *   desktop `DSH Harness.exe`  ->  reads ~/.dsh/launcher/launcher.ini
 *   ->  quick path (server alive: verify the token URL serves HTTP 200, open
 *       the fullscreen Edge app window silently) or cold path (breathing whale
 *       card -> single-spawner lock -> start-server.cmd -> poll -> open).
 * The exe is PREBUILT (assets/dsh-dock-launcher.exe, built by
 * scripts/build-launcher.ps1 from src/DshDockLauncher.cs), so installs need
 * no compiler; all per-machine paths ride the ini (base64 values). The old
 * .lnk->wscript->VBS->HTA chain is retired.
 *
 * Also registers the /launcher/api/stop route used by the sidebar 完全退出
 * menu (client.js) to terminate the server process (sessions persist
 * real-time, so nothing is lost — relaunch the desktop app to start over).
 * @module dsh-dock
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { materializeSuite } from './candidates.mjs'

export const name = 'dsh-dock'
export const inject = ['tools']

const DEFAULT_SHORTCUT_NAME = 'DSH Harness' // desktop app display name (sans .exe)
const DEFAULT_PORT = 3080
const DEFAULT_HOST = '127.0.0.1'

const LAUNCHER_DIR = join(homedir(), '.dsh', 'launcher')
const LOG_FILE = join(LAUNCHER_DIR, 'dsh-server.log')
const BATCH_FILE = join(LAUNCHER_DIR, 'start-server.cmd') // hidden spawner + log redirection
const INI_FILE = join(LAUNCHER_DIR, 'launcher.ini') // runtime config read by the exe
const MANIFEST_FILE = join(LAUNCHER_DIR, 'launcher.json') // { host, port, desktopDir }
const EDGE_APP_PROFILE = join(LAUNCHER_DIR, 'edge-app-profile')
const LOCK_FILE = join(LAUNCHER_DIR, '.starting.lock')
/**
 * Shutdown marker: written by the /launcher/api/stop route before the kill is
 * dispatched and deleted by the killing script once the listener is gone.
 * The launcher uses its freshness to absorb the exit/start race.
 */
const STOPPING_MARKER = join(LAUNCHER_DIR, '.stopping')

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))
const DOCK_ICO_ASSET = join(PACKAGE_DIR, 'assets', 'dsh-dock.ico')
const DOCK_ICO = join(LAUNCHER_DIR, 'dsh-dock.ico')
const DOCK_PNG_ASSET = join(PACKAGE_DIR, 'assets', 'whale.png')
const WHALE_PNG = join(LAUNCHER_DIR, 'whale.png')
/** Prebuilt launcher exe (see scripts/build-launcher.ps1 + src/DshDockLauncher.cs). */
const LAUNCHER_EXE_ASSET = join(PACKAGE_DIR, 'assets', 'dsh-dock-launcher.exe')
const LAUNCHER_EXE = join(LAUNCHER_DIR, 'dsh-dock-launcher.exe')
const DESKTOP_EXE_NAME = 'DSH Harness.exe'
/** ASCII marker compiled into the exe (assembly title); used to recognize an
 *  older desktop copy of our own launcher and refresh it safely. */
const LAUNCHER_MARKER = 'dsh-dock-launcher'

/** Legacy generated files retired with the v2 entry — removed on install. */
const LEGACY_FILES = [
  join(LAUNCHER_DIR, 'launch-dsh.vbs'),
  join(LAUNCHER_DIR, 'start-dsh.hta'),
  join(LAUNCHER_DIR, 'dsh-card.cs'),
  join(LAUNCHER_DIR, 'dsh-card.exe'),
  // swap-aside copies from copyReplacingLocked — removed once not running
  join(LAUNCHER_DIR, 'dsh-dock-launcher.exe.old'),
]

// v0.3.3 multi-DSH: candidate list + per-candidate batches live next to the
// suite. The exe reads candidates.json to render the picker; the T2 refresh
// script (deployed copy) is what the exe runs before a cold start.
const CANDIDATES_FILE = join(LAUNCHER_DIR, 'candidates.json')
const STATE_FILE = join(LAUNCHER_DIR, 'launcher-state.json')
const REFRESH_SCRIPT = join(LAUNCHER_DIR, 'dsh-dock-refresh.mjs')
const REFRESH_MODULE = join(LAUNCHER_DIR, 'candidates.mjs')
const REFRESH_SCRIPT_ASSET = join(PACKAGE_DIR, 'dsh-dock-refresh.mjs')
const REFRESH_MODULE_ASSET = join(PACKAGE_DIR, 'candidates.mjs')

const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

export {
  DEFAULT_SHORTCUT_NAME, DEFAULT_HOST, DEFAULT_PORT,
  LAUNCHER_DIR, LOG_FILE, BATCH_FILE, INI_FILE, LAUNCHER_EXE, DESKTOP_EXE_NAME, DOCK_ICO,
  detectNode, detectStartRecipe, buildStartBatch, buildLauncherIni,
  ensureDockIcon, copyLauncherExe, placeDesktopExe, removeLegacyFiles,
  detectListenerPort, resolveAutoOptions, installSuite,
}

/** Node engines floor of dsh: `^22.19 || >=24`. */
const NODE_FLOOR = [22, 19]

/** True when a node version satisfies dsh's engines requirement. */
function nodeOk(version) {
  const match = /^v(\d+)\.(\d+)/.exec(version ?? '')
  if (!match) return false
  const [major, minor] = [Number(match[1]), Number(match[2])]
  if (major === NODE_FLOOR[0]) return minor >= NODE_FLOOR[1]
  return major > NODE_FLOOR[0]
}

/**
 * Find a Node executable new enough for dsh. WinGet user installs first (the
 * common escape hatch when the PATH node is stale), then the running node.
 * A stale PATH node is the #1 cause of `createZstdDecompress` /
 * `stripTypeScriptTypes` boot failures on end-user machines.
 * @returns {string} absolute node executable path.
 */
function detectNode() {
  if (process.platform === 'win32') {
    const winget = join(homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages')
    if (existsSync(winget)) {
      const entries = readdirSync(winget).filter(e => e.startsWith('OpenJS.NodeJS'))
      for (const entry of entries) {
        const pkgDir = join(winget, entry)
        for (const sub of readdirSync(pkgDir)) {
          const node = join(pkgDir, sub, 'node.exe')
          if (!existsSync(node)) continue
          const probe = spawnSync(node, ['--version'], { encoding: 'utf8' })
          if (probe.status === 0 && nodeOk(probe.stdout.trim())) return node
        }
      }
    }
  }
  if (nodeOk(process.version)) return process.execPath
  throw new Error(
    `no Node >= ${NODE_FLOOR.join('.')} found (current ${process.version}). `
    + 'Install Node 24 LTS first, e.g. winget install OpenJS.NodeJS.LTS',
  )
}

/**
 * Resolve how the launcher starts the server, structured (never a shell
 * string — `cmd /c` mangles quotes and silently fails).
 * @param {string} node - absolute path of a compatible node executable.
 * @returns {{nodePath: string, serverArgs: string[], workingDirectory: string}} start recipe.
 */
function detectStartRecipe(node) {
  // Prefer the newest globally installed release (`@deepseek-ai/dsh@alpha`):
  // it owns the current `~/.dsh` sessions/profile and is what the desktop
  // app should cold-start. Local source checkouts stay as a fallback for
  // development only.
  const modulesRoots = [
    join(dirname(node), 'node_modules'), // winget/user prefix (npm root -g)
    join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules'),
    ...(process.platform === 'win32' ? [] : ['/usr/local/lib/node_modules', '/usr/lib/node_modules']),
  ]
  for (const modules of modulesRoots) {
    const bin = join(modules, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (existsSync(bin)) return { nodePath: node, serverArgs: [bin, 'web', '--no-open'], workingDirectory: LAUNCHER_DIR }
  }
  const localRepoCandidates = [
    join(homedir(), 'Documents', 'dsh'),
    join(homedir(), 'Desktop', 'DSH', 'deepseek-harness'),
  ]
  for (const repo of localRepoCandidates) {
    const bin = join(repo, 'apps', 'cli', 'src', 'bin.ts')
    const manifest = join(repo, 'package.json')
    if (existsSync(bin) && existsSync(manifest)) {
      return {
        nodePath: node,
        serverArgs: ['--import', 'tsx/esm', bin, 'web', '--no-open'],
        workingDirectory: repo,
      }
    }
  }
  const npxCli = join(node, '..', 'node_modules', 'npm', 'bin', 'npx-cli.js')
  if (existsSync(npxCli)) {
    return { nodePath: node, serverArgs: [npxCli, '@deepseek-ai/dsh', 'web', '--no-open'], workingDirectory: LAUNCHER_DIR }
  }
  return {
    nodePath: node,
    serverArgs: ['-e', 'console.error("dsh-dock: no @deepseek-ai/dsh installation found")'],
    workingDirectory: LAUNCHER_DIR,
  }
}

/**
 * Build start-server.cmd — the hidden spawner the launcher exe runs for a
 * cold start. A batch FILE avoids `cmd /c "…"` string-parsing differences;
 * batch content quoting is parsed plainly, and the file owns stdout/stderr
 * redirection into the launcher logs. UTF-8 body after a codepage switch
 * keeps non-ASCII (Chinese) usernames decodable.
 * @param {object} options - port, nodePath, serverArgs for this installation.
 * @returns {string} the batch file text (CRLF).
 */
function buildStartBatch(options) {
  const { port, nodePath, serverArgs } = options
  const q = value => `"${String(value).replace(/"/g, '""')}"`
  const args = serverArgs.map(a => q(a)).join(' ')
  const log = LOG_FILE
  const err = `${LOG_FILE}.err`
  return [
    '@echo off',
    'chcp 65001 >nul',
    `rem dsh-dock cold-start spawner (port ${port}); regenerated on install`,
    'rem Wait until the port is REALLY free before truncating the log and',
    'rem starting: a predecessor may still be shutting down, or a peer batch',
    'rem may already have taken the port — opening "> log" early would wipe',
    'rem a live server\'s output and corrupt its token line. Cap ~30s.',
    'setlocal',
    'set /a WAIT_TRIES=0',
    ':PORT_WAIT',
    'netstat -ano | findstr /r /c:":' + String(port) + ' " | findstr /c:"LISTENING" >nul 2>&1',
    'if errorlevel 1 goto PORT_FREE',
    'set /a WAIT_TRIES+=1',
    'if %WAIT_TRIES% GEQ 30 exit /b 0',
    'ping 127.0.0.1 -n 2 >nul',
    'goto PORT_WAIT',
    ':PORT_FREE',
    `${q(nodePath)} ${args} > ${q(log)} 2> ${q(err)}`,
  ].join('\r\n')
}

/**
 * Build launcher.ini — the runtime config read by the prebuilt exe. Values
 * are base64 so arbitrary non-ASCII paths (Chinese usernames) survive any
 * code page; the exe decodes them with UTF-8.
 * @param {object} options - host, port, workingDirectory for this installation.
 * @returns {string} the ini text.
 */
function buildLauncherIni(options) {
  const { host, port } = options
  const b64 = value => Buffer.from(String(value), 'utf8').toString('base64')
  return [
    `URL=${b64(`http://${host}:${port}/`)}`,
    `LOG=${b64(LOG_FILE)}`,
    `BATCH=${b64(BATCH_FILE)}`,
    `PROFILE=${b64(EDGE_APP_PROFILE)}`,
    `STOPPING=${b64(STOPPING_MARKER)}`,
    `LOCK=${b64(LOCK_FILE)}`,
    `WHALE=${b64(WHALE_PNG)}`,
    // v0.3.3: node for the T2 refresh, plus the candidate/state data files.
    `NODE=${b64(options.nodePath ?? process.execPath)}`,
    `CANDIDATES=${b64(CANDIDATES_FILE)}`,
    `STATE=${b64(STATE_FILE)}`,
    `REFRESH=${b64(REFRESH_SCRIPT)}`,
    '',
  ].join('\r\n')
}

/**
 * Deploy the packaged whale icon + splash image next to the launcher suite
 * (refresh only when the packaged copies change).
 * @returns {boolean} whether an icon file is present at DOCK_ICO.
 */
function ensureDockIcon() {
  try {
    const deploy = [
      [DOCK_ICO_ASSET, DOCK_ICO],
      [DOCK_PNG_ASSET, WHALE_PNG],
    ]
    for (const [asset, target] of deploy) {
      if (!existsSync(asset)) continue
      if (!existsSync(target) || readFileSync(target).length !== readFileSync(asset).length) {
        mkdirSync(LAUNCHER_DIR, { recursive: true })
        copyFileSync(asset, target)
      }
    }
    return existsSync(DOCK_ICO)
  } catch { /* icon is cosmetic; never fail the install over it */ }
  return existsSync(DOCK_ICO)
}

/**
 * Copy src → dest, tolerating a RUNNING exe at dest: Windows locks the image
 * of a running process against writes (EBUSY/EPERM), but allows renaming it
 * out of the way — the classic updater trick. The renamed-aside ".old" copy
 * is removed on a later install once its process has exited. Without this,
 * the canonical upgrade flow (menu exit → double-click whale → server boots →
 * plugin activates) always found the desktop exe locked by the still-running
 * old launcher, so the desktop copy never upgraded.
 * @param {string} src - source file (packaged asset).
 * @param {string} dest - destination file (possibly a running image).
 */
function copyReplacingLocked(src, dest) {
  try {
    copyFileSync(src, dest)
  } catch (err) {
    if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err
    const aside = `${dest}.old`
    try { unlinkSync(aside) } catch { /* an even older swap still running */ }
    renameSync(dest, aside) // renaming a running image is allowed on Windows
    try {
      copyFileSync(src, dest)
    } catch (err2) {
      try { renameSync(aside, dest) } catch { /* next install retries the swap */ }
      throw err2
    }
  }
}

/**
 * Refresh the launcher-suite copy of the prebuilt exe (content-compared so
 * reinstalls upgrade it in place).
 * @returns {string} the launcher-dir exe path.
 */
function copyLauncherExe() {
  if (!existsSync(LAUNCHER_EXE_ASSET)) {
    throw new Error('packaged launcher exe missing: assets/dsh-dock-launcher.exe (run scripts/build-launcher.ps1)')
  }
  mkdirSync(LAUNCHER_DIR, { recursive: true })
  const current = existsSync(LAUNCHER_EXE) ? readFileSync(LAUNCHER_EXE) : undefined
  const next = readFileSync(LAUNCHER_EXE_ASSET)
  if (current === undefined || !current.equals(next)) copyReplacingLocked(LAUNCHER_EXE_ASSET, LAUNCHER_EXE)
  return LAUNCHER_EXE
}

/** Resolve the desktop known folder (PowerShell; portable fallback). */
function resolveDesktopDir() {
  if (process.platform === 'win32') {
    try {
      const out = spawnSync(POWERSHELL, ['-NoProfile', '-Command', '[Environment]::GetFolderPath(\'Desktop\')'],
        { encoding: 'utf8' }).stdout.trim()
      if (out) return out
    } catch { /* fall through */ }
  }
  return join(homedir(), 'Desktop')
}

/**
 * Place (or refresh) the desktop `DSH Harness.exe`.
 *
 * Overwrite policy: a same-named desktop file is only overwritten when its
 * binary contains our launcher marker (an older copy of ourselves); anything
 * else is refused loudly — never clobber an unrelated user file. A legacy
 * `DSH Harness.lnk` from the v1 shortcut entry is removed. The resolved
 * desktop directory is cached into the manifest so later boots skip the
 * PowerShell known-folder lookup entirely.
 * @param {object} options - shortcutName/host/port for this installation.
 * @returns {string} the desktop exe path.
 */
function placeDesktopExe(options) {
  const manifest = readManifestSafe()
  let desktopDir = manifest !== undefined && typeof manifest.desktopDir === 'string'
    ? manifest.desktopDir : null
  if (desktopDir === null || !existsSync(desktopDir)) desktopDir = resolveDesktopDir()
  const desktopExeName = `${options.shortcutName ?? DEFAULT_SHORTCUT_NAME}.exe`
  const desktopExe = join(desktopDir, desktopExeName)
  // Best-effort: clear a previous swap-aside copy once its process is gone.
  try { unlinkSync(`${desktopExe}.old`) } catch { /* still running or absent */ }
  const asset = readFileSync(LAUNCHER_EXE_ASSET)
  const marker = Buffer.from(LAUNCHER_MARKER, 'ascii')
  if (existsSync(desktopExe)) {
    const existing = readFileSync(desktopExe)
    if (existing.equals(asset)) {
      removeLegacyLnk(desktopDir, options)
      persistManifest(options, desktopDir)
      return desktopExe
    }
    if (!existing.includes(marker)) {
      throw new Error(
        `refusing to overwrite an unrelated desktop file: ${desktopExe}`
        + ' (rename or remove it, then re-run the install)',
      )
    }
    // our older copy: refresh — tolerate the image being locked by a
    // still-running launcher (swap-aside via rename, see copyReplacingLocked)
    copyReplacingLocked(LAUNCHER_EXE_ASSET, desktopExe)
  } else {
    copyFileSync(LAUNCHER_EXE_ASSET, desktopExe)
  }
  // v1 leftovers: the shortcut entry is superseded by the exe.
  removeLegacyLnk(desktopDir, options)
  persistManifest(options, desktopDir)
  return desktopExe
}

/** Best-effort removal of the retired v1 desktop shortcut. */
function removeLegacyLnk(desktopDir, options) {
  const legacyLnk = join(desktopDir, `${options.shortcutName ?? DEFAULT_SHORTCUT_NAME}.lnk`)
  if (existsSync(legacyLnk)) {
    try { unlinkSync(legacyLnk) } catch { /* locked or already gone */ }
  }
}

/** Persist the install manifest ({ host, port, desktopDir }). */
function persistManifest(options, desktopDir) {
  writeFileSync(MANIFEST_FILE,
    `${JSON.stringify({ host: options.host, port: options.port, desktopDir }, null, 2)}\n`, 'utf8')
}

/** Read the install manifest (launcher.json), or undefined. */
function readManifestSafe() {
  try { return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) } catch { return undefined }
}

/** Remove the retired v1 generated files (idempotent, best-effort). */
function removeLegacyFiles() {
  for (const f of LEGACY_FILES) {
    try { if (existsSync(f)) unlinkSync(f) } catch { /* locked by a running legacy card */ }
  }
}

/**
 * Detect the port this very dsh server listens on, straight from the
 * environment: the LISTENING sockets of our own PID via netstat (~100ms even
 * on AV-hardened hosts — never Get-NetTCPConnection). Falls back to the
 * install manifest, then the default. With several listeners, prefer the
 * previously installed port, else the lowest for determinism.
 * @param {number} [pid] - the server PID (defaults to this process).
 * @returns {number} detected port.
 */
function detectListenerPort(pid = process.pid) {
  try {
    const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout ?? ''
    const wanted = String(pid)
    const ports = new Set()
    for (const raw of out.split(/\r?\n/)) {
      const m = /^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(raw.trim())
      if (m && m[3] === wanted) ports.add(Number(m[2]))
    }
    if (ports.size === 1) return [...ports][0]
    if (ports.size > 1) {
      const known = readInstalledPort()
      if (ports.has(known)) return known
      return Math.min(...ports)
    }
  } catch { /* netstat unavailable */ }
  return readInstalledPort()
}

/**
 * Build install options purely from the environment — no arguments needed:
 * node and start recipe by detection, port from this server's live listener.
 * Used by the automatic install at plugin activation.
 * @returns {object} fully-resolved install options.
 */
function resolveAutoOptions() {
  const node = detectNode()
  const recipe = detectStartRecipe(node)
  const options = {
    shortcutName: DEFAULT_SHORTCUT_NAME,
    host: DEFAULT_HOST,
    port: detectListenerPort(),
    nodePath: recipe.nodePath,
    serverArgs: recipe.serverArgs,
    workingDirectory: recipe.workingDirectory,
  }
  if (options.port !== DEFAULT_PORT) {
    const webAt = options.serverArgs.indexOf('web')
    options.serverArgs = [...options.serverArgs.slice(0, webAt + 2), '--port', String(options.port)]
  }
  return options
}

/** Content-gated write: only touch the file when its text differs. */
function writeIfChanged(file, text) {
  let current = null
  try { current = readFileSync(file, 'utf8') } catch { /* absent */ }
  if (current !== text) writeFileSync(file, text, 'utf8')
}

/**
 * Write the whole launcher suite (batch + ini + manifest + exes + icons +
 * desktop app + the v0.3.3 candidate set). Idempotent by content: every
 * writer is content-gated, so an unchanged suite costs only a few reads —
 * no writes, no PowerShell. Always runs (no early skip) so a DSH installed
 * between boots still lands in candidates.json at the next activation.
 * @param {object} options - shortcutName/host/port/nodePath/serverArgs/workingDirectory.
 * @returns {{desktopExePath: string, launcherDir: string, logFile: string, skipped?: boolean}}
 */
function installSuite(options) {
  mkdirSync(LAUNCHER_DIR, { recursive: true })
  writeIfChanged(INI_FILE, buildLauncherIni(options))
  ensureDockIcon()
  copyLauncherExe()
  removeLegacyFiles()
  const payload = materializeSuite({
    nodePath: options.nodePath,
    launcherDir: LAUNCHER_DIR,
    logPath: LOG_FILE,
    errPath: `${LOG_FILE}.err`,
    port: options.port,
  })
  // T2 refresh depends on both modules being next to candidates.json.
  writeIfChanged(REFRESH_SCRIPT, readFileSync(REFRESH_SCRIPT_ASSET, 'utf8'))
  writeIfChanged(REFRESH_MODULE, readFileSync(REFRESH_MODULE_ASSET, 'utf8'))
  const desktopExePath = placeDesktopExe(options)
  return {
    desktopExePath,
    launcherDir: LAUNCHER_DIR,
    logFile: LOG_FILE,
    skipped: suiteIsCurrent(options, readManifestSafe(), payload),
  }
}

/** Fast path: is the on-disk suite already exactly what options would bake? */
function suiteIsCurrent(options, manifest, payload) {
  try {
    if (manifest === undefined || typeof manifest.desktopDir !== 'string') return false
    if (manifest.host !== options.host || manifest.port !== options.port) return false
    const desktopExe = join(manifest.desktopDir, `${options.shortcutName}.exe`)
    const asset = readFileSync(LAUNCHER_EXE_ASSET)
    if (!existsSync(desktopExe) || !readFileSync(desktopExe).equals(asset)) return false
    if (!existsSync(LAUNCHER_EXE) || !readFileSync(LAUNCHER_EXE).equals(asset)) return false
    if (readFileSync(INI_FILE, 'utf8') !== buildLauncherIni(options)) return false
    if (!existsSync(BATCH_FILE)) return false
    if (!existsSync(CANDIDATES_FILE) || !existsSync(REFRESH_SCRIPT) || !existsSync(REFRESH_MODULE)) return false
    if (payload !== undefined) {
      const live = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf8'))
      if (JSON.stringify(live.candidates) !== JSON.stringify(payload.candidates)) return false
    }
    // The card renders from whale.png at runtime — a missing asset must
    // trigger a full install (ensureDockIcon) instead of a skip.
    if (!existsSync(WHALE_PNG)) return false
    return true
  } catch { return false }
}

// ── web sidebar Exit action support ─────────────────────────────────────────
//
// The client face posts to /launcher/api/stop. The fence below mirrors the
// third-party route convention: loopback (or a deployment-trusted authority)
// Host plus same-origin browser markers; anything else is rejected with 403.

/** Parse the Host header into { hostname, port } tolerating IPv6 brackets. */
function parseAuthority(header) {
  if (header === undefined) return undefined
  const value = String(header)
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    if (end === -1) return undefined
    return { hostname: value.slice(1, end), port: value.slice(end + 2) || undefined }
  }
  const colon = value.indexOf(':')
  if (colon === -1) return { hostname: value, port: undefined }
  return { hostname: value.slice(0, colon), port: value.slice(colon + 1) || undefined }
}

/** Whether a hostname is loopback in the practical Windows sense. */
function isLoopbackHostname(hostname) {
  return hostname === 'localhost' || hostname === '::1' || hostname === '127.0.0.1' || /^127\./.test(hostname)
}

/**
 * Decide whether one request may reach the stop route.
 * @param {object} req - node HTTP request facts (headers).
 * @param {string[]} [trustedHosts] - non-loopback authorities this deployment serves.
 * @returns {boolean} trust verdict.
 */
function isTrustedStopRequest(req, trustedHosts = []) {
  const hostUrl = parseAuthority(req.headers.host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname)
    && !trustedHosts.some(authority => authority !== undefined && String(authority).split(':')[0] === hostUrl.hostname)) {
    return false
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).hostname === hostUrl.hostname
  } catch {
    return false
  }
}

/** Write a small JSON response. */
function writeJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/**
 * Terminate the process listening on the DSH port (the server itself) via a
 * short-lived PowerShell, scheduled a moment later so the HTTP response can
 * flush first. Sessions persist real-time, so this loses nothing.
 *
 * Fast path: when selfPid > 0 the route already verified the manifest port
 * matches this server's own port, so the killer is this very process — it is
 * stopped directly with no lookup at all. Otherwise (a manifest pointing at
 * another process, e.g. tests) the listener PID comes from `netstat -ano`
 * parsing — never Get-NetTCPConnection, which takes ~2.9s per call on
 * AV-hardened hosts while netstat answers in ~100ms.
 * @param {object} subprocess - the subprocess service (spawn seam).
 * @param {number} port - the DSH port whose listener to stop.
 * @param {number} selfPid - this process's PID when it is the target, else 0.
 * @returns {boolean} whether the kill was dispatched.
 */
function dispatchServerStop(subprocess, port, selfPid) {
  const q = (value) => `'${String(value).replace(/'/g, "''")}'`
  const portRe = String(Number(port) || 3080)
  const netstatFilter = `Where-Object { $_ -match 'TCP' -and $_ -match '\\:${portRe}${'\\s'}' -and $_ -match 'LISTENING' }`
  const script = [
    `Start-Sleep -Milliseconds 600`,
    ...(Number(selfPid) > 0
      ? [
        // Fast path: the listener is this server — stop it directly.
        `Stop-Process -Id ${Number(selfPid)} -Force -ErrorAction SilentlyContinue`,
      ]
      : [
        // Fallback: the manifest points elsewhere (tests); netstat is the
        // source of truth. PID is the last token of each LISTENING line.
        `$ids = @((netstat -ano) | ${netstatFilter} | ForEach-Object { ($_ -split '\\s+')[-1] } | Sort-Object -Unique)`,
        'foreach ($id in $ids) { Stop-Process -Id ([int]$id) -Force -ErrorAction SilentlyContinue }',
      ]),
    // Clear the shutdown marker once the listener is really gone, so the
    // next double-click treats the server as normally offline.
    `Start-Sleep -Milliseconds 150`,
    `$still = @((netstat -ano) | ${netstatFilter})`,
    `if ($still.Count -eq 0) { Remove-Item ${q(STOPPING_MARKER)} -Force -ErrorAction SilentlyContinue }`,
  ].join('; ')
  subprocess.spawn({
    argv: [POWERSHELL, '-NoProfile', '-NonInteractive', '-Command', script],
    cwd: LAUNCHER_DIR,
    stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
    graceMs: 5000,
  })
  return true
}

/**
 * Port the suite was baked with (launcher.json), falling back to the default
 * when no manifest exists (pre-manifest installs).
 * @returns {number} installed port.
 */
function readInstalledPort() {
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'))
    return Number(manifest.port) || DEFAULT_PORT
  } catch {
    return DEFAULT_PORT
  }
}

/**
 * Register the launcher_install tool on `ctx.tools` and the /launcher/api/stop
 * route (client Exit action).
 * @param {import('@deepseek-ai/cordis').Context} ctx - registrant context.
 */
export function apply(ctx) {
  ctx.tools.register({
    name: 'launcher_install',
    description:
      'Install a one-click desktop launcher for DSH Harness on this Windows machine. '
      + 'Creates a desktop app (DSH Harness.exe, whale icon) that starts the DSH '
      + 'server in the background (no console window), shows a splash card while '
      + 'waiting, then opens the GUI in a fullscreen Edge app window. If DSH is '
      + 'already running, the desktop app just opens the GUI. Use when the user '
      + 'asks for a desktop shortcut / 桌面图标 / 一键启动 / one-click start for DSH.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        shortcutName: {
          type: 'string',
          description: `Desktop app display name (sans .exe). Default: "${DEFAULT_SHORTCUT_NAME}".`,
        },
        host: { type: 'string', description: `DSH bind host. Default: ${DEFAULT_HOST}.` },
        port: { type: 'integer', description: `DSH port. Default: ${DEFAULT_PORT}.` },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          desktopExePath: { type: 'string' },
          launcherDir: { type: 'string' },
          logFile: { type: 'string' },
        },
        required: ['desktopExePath', 'launcherDir', 'logFile'],
      },
      render(_args, value) {
        return [{
          type: 'text',
          text: `Desktop launcher installed: ${value.desktopExePath}. `
            + `Double-click it to start DSH; logs go to ${value.logFile}.`,
        }]
      },
    },
    async execute(args) {
      if (process.platform !== 'win32') {
        throw new Error('dsh-dock currently supports Windows only (macOS/Linux planned)')
      }
      const node = detectNode()
      const recipe = detectStartRecipe(node)
      const options = {
        shortcutName: args.shortcutName ?? DEFAULT_SHORTCUT_NAME,
        host: args.host ?? DEFAULT_HOST,
        port: args.port ?? DEFAULT_PORT,
        nodePath: recipe.nodePath,
        serverArgs: recipe.serverArgs,
        workingDirectory: recipe.workingDirectory,
      }
      if (args.port !== undefined) {
        const webAt = recipe.serverArgs.indexOf('web')
        options.serverArgs = [...recipe.serverArgs.slice(0, webAt + 2), '--port', String(args.port)]
      }
      const result = installSuite(options)
      return {
        desktopExePath: result.desktopExePath,
        launcherDir: LAUNCHER_DIR,
        logFile: LOG_FILE,
      }
    },
    presentCall: args => ({ card: 'generic', title: 'Install desktop launcher', kind: 'other', rawInput: args }),
  })

  // Auto-install: the suite lands on disk by itself shortly after activation
  // — parameters are extracted from the environment (live listener port via
  // netstat on our own PID, node + start recipe via detection). Deferred a
  // beat so boot stays snappy; failures only log and never break activation.
  // The tool above remains for custom re-installs (name/host/port).
  if (process.platform === 'win32') {
    const timer = setTimeout(() => {
      try {
        const result = installSuite(resolveAutoOptions())
        console.info('[dsh-dock] launcher suite ' + (result.skipped ? 'already current' : 'installed')
          + ': ' + result.desktopExePath)
      } catch (e) {
        console.warn('[dsh-dock] auto-install skipped:', e.message)
      }
    }, 2000)
    ctx.effect(() => () => clearTimeout(timer), 'dsh-dock: auto-install timer')
  }
  ctx.inject(['webServer'], (webCtx) => {
    ctx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/launcher/api/stop',
      handler: async (req, res) => {
        const webRuntime = ctx.get('webRuntime')
        const trustedHosts = webRuntime !== undefined && webRuntime.trustedHosts !== undefined
          ? webRuntime.trustedHosts
          : []
        if (!isTrustedStopRequest(req, trustedHosts)) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
          return
        }
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
          return
        }
        const subprocess = ctx.get('subprocess')
        if (subprocess === undefined) {
          writeJson(res, 503, { ok: false, error: { code: 'unavailable', message: 'subprocess service not mounted' } })
          return
        }
        const port = readInstalledPort()
        // Shutdown marker: the launcher waits it out instead of opening the
        // dying server when a double-click lands mid-shutdown. Epoch SECONDS
        // on purpose: the launcher reads it as a plain number.
        try {
          mkdirSync(LAUNCHER_DIR, { recursive: true })
          writeFileSync(STOPPING_MARKER, String(Math.floor(Date.now() / 1000)), 'utf8')
        } catch { /* marker is best-effort */ }
        // Self-kill fast path: when the manifest port matches the port this
        // request arrived on, the listener IS this process — no lookup
        // needed. A mismatched manifest (tests) forces the netstat fallback
        // so this server can never be killed by mistake.
        const hostAuth = parseAuthority(req.headers.host)
        const selfPid = hostAuth !== undefined && Number(hostAuth.port) === port
          ? process.pid
          : 0
        dispatchServerStop(subprocess, port, selfPid)
        writeJson(res, 200, { ok: true, note: `server on port ${port} is stopping; sessions were persisted` })
      },
    }), 'dsh-dock: /launcher/api/stop route')
  })
}
