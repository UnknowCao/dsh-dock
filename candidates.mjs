/**
 * candidates.mjs — shared DSH candidate detection + suite materialization.
 *
 * v0.3.3 multi-DSH selection: one native exe may cold-start any installed
 * DeepSeek Harness. This module is the single source of truth for BOTH
 * writers that keep the candidate list fresh:
 *
 *   - index.js            — at plugin activation (T1, content-compared idle)
 *   - dsh-dock-refresh.mjs — at cold start, run by the launcher exe (T2)
 *
 * "Switching DSH" never rewrites anything: each candidate owns one baked
 * batch file (start-server.cmd for the default, start-server.<id>.cmd for
 * alternates) and selection only points the exe at which one to run.
 *
 * Pure node:fs/node:path/node:crypto — no host imports.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'

export const KIND_LABEL = { global: '全局安装', npx: 'npx 缓存', source: '源码检出' }
export const KIND_ORDER = { global: 0, npx: 1, source: 2 }

/** Lightweight version ordering (numeric core first, release > prerelease). */
export function compareVersion(a, b) {
  const split = (v) => String(v).split('-')[0].split('.').map((n) => {
    const x = Number(n)
    return Number.isNaN(x) ? 0 : x
  })
  const pa = split(a)
  const pb = split(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  const ra = String(a).includes('-') ? 0 : 1
  const rb = String(b).includes('-') ? 0 : 1
  if (ra !== rb) return ra - rb
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

/** Read the version from a dsh package root, or 'unknown'. */
function versionOfDsh(packageDir) {
  try {
    const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    if (typeof pkg.version === 'string' && pkg.version.length > 0) return pkg.version
  } catch { /* not a package */ }
  return 'unknown'
}

const dshPkg = (modulesRoot) => join(modulesRoot, '@deepseek-ai', 'dsh')

/** Global-install module roots that may hold @deepseek-ai/dsh. */
export function globalRoots(nodePath) {
  const roots = [join(dirname(nodePath), 'node_modules')]
  const roaming = join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules')
  if (!roots.includes(roaming)) roots.push(roaming)
  return roots
}

/** Cached @deepseek-ai/dsh copies under every npx cache entry. */
export function npxCacheDirs() {
  const local = process.env.LOCALAPPDATA
  const cache = local ? join(local, 'npm-cache', '_npx') : null
  if (!cache || !existsSync(cache)) return []
  const found = []
  for (const entry of readdirSync(cache)) {
    const pkg = dshPkg(join(cache, entry, 'node_modules'))
    if (existsSync(join(pkg, 'package.json'))) found.push(pkg)
  }
  return found
}

/** Locate the npm npx CLI used as the zero-candidate fallback recipe. */
export function findNpxCli(nodePath) {
  const nodeDir = dirname(nodePath)
  const candidates = [
    join(nodeDir, '..', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return undefined
}

/** Dev source checkouts (same list the old single-recipe detection used). */
export function sourceCheckoutDirs() {
  return [
    join(homedir(), 'Documents', 'dsh'),
    join(homedir(), 'Desktop', 'DSH', 'deepseek-harness'),
  ]
}

function shortId(path) {
  return createHash('sha1').update(path).digest('hex').slice(0, 10)
}

function pathTail(p) {
  const parts = String(p).split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('\\')
}

/**
 * Scan every installed dsh and produce the sorted candidate row set.
 * @param {object} opts - { nodePath, launcherDir, port }.
 * @returns {{ rows: object[], npxCli: string|undefined }}
 */
export function scanCandidates({ nodePath, launcherDir, port }) {
  const found = []
  for (const root of globalRoots(nodePath)) {
    const pkg = dshPkg(root)
    if (existsSync(join(pkg, 'package.json'))) {
      const bin = join(pkg, 'lib', 'bin.js')
      found.push({ kind: 'global', pkg, bin, recipe: { args: [bin, 'web', '--no-open'], cwd: launcherDir } })
    }
  }
  for (const pkg of npxCacheDirs()) {
    const bin = join(pkg, 'lib', 'bin.js')
    found.push({ kind: 'npx', pkg, bin, recipe: { args: [bin, 'web', '--no-open'], cwd: launcherDir } })
  }
  for (const repo of sourceCheckoutDirs()) {
    const bin = join(repo, 'apps', 'cli', 'src', 'bin.ts')
    if (existsSync(bin) && existsSync(join(repo, 'package.json'))) {
      found.push({ kind: 'source', pkg: repo, bin, recipe: { args: ['--import', 'tsx/esm', bin, 'web', '--no-open'], cwd: repo } })
    }
  }

  // Collapse duplicate paths; prefer the higher-priority kind per path.
  const byPath = new Map()
  for (const f of found) {
    const prev = byPath.get(f.pkg)
    if (prev === undefined || KIND_ORDER[f.kind] < KIND_ORDER[prev.kind]) byPath.set(f.pkg, f)
  }

  const seenLabels = new Map()
  const rows = [...byPath.values()].map((f) => {
    const version = versionOfDsh(f.pkg)
    const base = `${version} · ${KIND_LABEL[f.kind]}`
    const n = seenLabels.get(base) ?? 0
    seenLabels.set(base, n + 1)
    const label = n === 0 ? base : `${base} · ${pathTail(f.pkg)}`
    return {
      id: shortId(f.pkg),
      version,
      kind: f.kind,
      path: f.pkg,
      label,
      recipe: { nodePath, ...f.recipe },
    }
  })

  rows.sort((a, b) =>
    compareVersion(b.version, a.version)
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  )
  return { rows, npxCli: findNpxCli(nodePath) }
}

/** Batch text for one candidate recipe (port-wait + hidden spawn + logs). */
export function buildServerBatch({ port, nodePath, serverArgs, cwd, logPath, errPath }) {
  const q = (value) => `"${String(value).replace(/"/g, '""')}"`
  const args = serverArgs.map((a) => q(a)).join(' ')
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
    `${q(nodePath)} ${args} > ${q(logPath)} 2> ${q(errPath)}`,
  ].join('\r\n')
}

/**
 * Materialize the whole candidate suite onto disk (batches + candidates.json).
 * Idempotent by content: existing batches are only rewritten when their
 * content changed (i.e. the recipe or version set changed); selection never
 * touches files.
 * @param {object} opts - { nodePath, launcherDir, logPath, errPath, port, url }.
 * @returns {object} candidates.json payload ({ format, updatedAt, port, candidates, npxFallback }).
 */
export function materializeSuite({ nodePath, launcherDir, logPath, errPath, port }) {
  mkdirSync(launcherDir, { recursive: true })
  const { rows, npxCli } = scanCandidates({ nodePath, launcherDir, port })

  const writeIfChanged = (file, text) => {
    let current = null
    try { current = readFileSync(file, 'utf8') } catch { /* absent */ }
    if (current !== text) writeFileSync(file, text, 'utf8')
  }

  rows.forEach((row, index) => {
    const name = index === 0 ? 'start-server.cmd' : `start-server.${row.id}.cmd`
    row.batch = name
    const batchPath = join(launcherDir, name)
    const batchText = buildServerBatch({
      port,
      nodePath: row.recipe.nodePath,
      serverArgs: row.recipe.args,
      cwd: row.recipe.cwd,
      logPath,
      errPath,
    })
    writeIfChanged(batchPath, batchText)
  })

  // Zero real candidates: keep the canonical npx-fallback batch (its .cmd is
  // written only when it changes), so the exe's 0-candidate prompt has a
  // concrete action to run when the user says "yes, fetch via npx".
  let npxFallback = null
  if (rows.length === 0 && npxCli !== undefined) {
    npxFallback = { command: `${nodePath} ${npxCli} @deepseek-ai/dsh web --no-open` }
    const batchText = buildServerBatch({
      port,
      nodePath,
      serverArgs: [npxCli, '@deepseek-ai/dsh', 'web', '--no-open'],
      cwd: launcherDir,
      logPath,
      errPath,
    })
    writeIfChanged(join(launcherDir, 'start-server.cmd'), batchText)
  }

  const payload = {
    format: 1,
    updatedAt: Date.now(),
    port,
    candidates: rows.map((r) => ({
      id: r.id,
      version: r.version,
      kind: r.kind,
      path: r.path,
      label: r.label,
      batch: r.batch,
    })),
    npxFallback,
  }
  writeFileSync(join(launcherDir, 'candidates.json'),
    `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}
