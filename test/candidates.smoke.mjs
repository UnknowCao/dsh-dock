/**
 * candidates.smoke.mjs — offline smoke/unit tests for the dsh-dock candidate
 * scanner (candidates.mjs), including the v0.6 adaptive (M1) discovery and the
 * v0.7 user-pointed extra roots (M2).
 *
 * Run:   node --test test/candidates.smoke.mjs
 *        (or:  node --test  — Node >= 18 with node:test; Node 24 ships it)
 *
 * Safety: every FS-touching test runs against a THROWAWAY temp dir, never the
 * real ~/.dsh/launcher. The scan exercises whatever real Node/global roots this
 * machine exposes, but assertions are structural (well-formed, sorted, deduped,
 * files written) — they do NOT depend on a particular dsh being installed, so
 * the suite is green on an arbitrary dev box, not only the author's. Where an
 * M2 test needs a "real" install it fabricates a minimal fake
 * `node_modules/@deepseek-ai/dsh` inside the temp dir.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import {
  compareVersion,
  globalRoots,
  allGlobalRoots,
  scanCandidates,
  materializeSuite,
  readExtraRoots,
  moduleRootForUserPath,
  EXTRA_ROOTS_FILE,
} from '../candidates.mjs'

const NODE = process.execPath

/** Fabricate a minimal installable dsh package: <dir>/node_modules/@deepseek-ai/dsh. */
function makeFakeDsh(dir, version) {
  const pkgDir = join(dir, 'node_modules', '@deepseek-ai', 'dsh')
  mkdirSync(join(pkgDir, 'lib'), { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/dsh', version }, null, 2))
  writeFileSync(join(pkgDir, 'lib', 'bin.js'), 'export {}\n')
  return pkgDir
}

test('compareVersion orders releases above prereleases and by core number', () => {
  assert.equal(compareVersion('0.6.0', '0.6.0'), 0)
  assert.equal(compareVersion('0.6.0', '0.5.0'), 1)          // newer core
  assert.equal(compareVersion('0.5.0', '0.6.0'), -1)
  assert.equal(compareVersion('0.6.0', '0.6.0-rc.1'), 1)     // release > prerelease
  assert.equal(compareVersion('0.1.2-rc.1', '0.1.2-alpha.4'), 1)
  assert.equal(compareVersion('0.1.10', '0.1.9'), 1)         // numeric, not lexicographic
})

test('allGlobalRoots is a superset of globalRoots and is deduplicated', () => {
  const base = globalRoots(NODE)
  const expanded = allGlobalRoots(NODE)
  // every baseline root is present
  for (const root of base) assert.ok(expanded.includes(root), `missing baseline root: ${root}`)
  // expanded is at least as broad (M1 adds manager-discovered roots)
  assert.ok(expanded.length >= base.length, 'M1 must never shrink the root set')
  // no duplicates
  assert.equal(new Set(expanded).size, expanded.length, 'allGlobalRoots must be unique')
})

test('scanCandidates returns well-formed, sorted, deduped rows (throwaway dir)', () => {
  const launcherDir = mkdtempSync(join(tmpdir(), 'dsh-dock-cand-'))
  try {
    const { rows } = scanCandidates({ nodePath: NODE, launcherDir, port: 3080 })
    // structural shape
    for (const row of rows) {
      assert.ok(typeof row.version === 'string' && row.version.length > 0, 'version')
      assert.ok(row.id && row.id.length > 0, 'id')
      assert.ok(typeof row.kind === 'string' && row.kind.length > 0, 'kind')
      assert.ok(typeof row.label === 'string' && row.label.length > 0, 'label')
      assert.ok(typeof row.path === 'string' && row.path.length > 0, 'path')
      assert.ok(row.recipe && row.recipe.nodePath && Array.isArray(row.recipe.args), 'recipe.nodePath + args')
    }
    // sorted newest-first by compareVersion
    for (let i = 1; i < rows.length; i++) {
      assert.ok(compareVersion(rows[i - 1].version, rows[i].version) >= 0,
        `rows not sorted desc: ${rows[i - 1].version} before ${rows[i].version}`)
    }
    // no duplicate install paths
    const paths = new Set(rows.map((r) => r.path))
    assert.equal(paths.size, rows.length, 'candidate paths must be unique')
  } finally {
    rmSync(launcherDir, { recursive: true, force: true })
  }
})

test('materializeSuite writes candidates.json + one batch per row (throwaway dir)', () => {
  const launcherDir = mkdtempSync(join(tmpdir(), 'dsh-dock-suite-'))
  try {
    const log = join(launcherDir, 'server.log')
    const payload = materializeSuite({
      nodePath: NODE,
      launcherDir,
      logPath: log,
      errPath: `${log}.err`,
      port: 3080,
    })
    const disk = JSON.parse(readFileSync(join(launcherDir, 'candidates.json'), 'utf8'))
    assert.equal(disk.port, 3080)
    assert.equal(disk.format, 1)
    assert.equal(disk.candidates.length, payload.candidates.length)
    for (const row of payload.candidates) {
      // the default batch or an id-suffixed batch must exist on disk
      const batchFile = join(launcherDir, row.batch)
      assert.ok(existsSync(batchFile), `missing batch: ${row.batch}`)
    }
    // every payload candidate is echoed in candidates.json with matching id/version/path/batch
    for (const c of disk.candidates) {
      const match = payload.candidates.find((r) => r.id === c.id)
      assert.ok(match, `payload missing candidate ${c.id}`)
      assert.equal(match.version, c.version)
      assert.equal(match.path, c.path)
      assert.equal(match.batch, c.batch)
    }
  } finally {
    rmSync(launcherDir, { recursive: true, force: true })
  }
})

// ── M2 · user-pointed extra roots (v0.7) ───────────────────────────────────

test('M2 readExtraRoots accepts array + {roots} forms and tolerates a BOM', () => {
  const launcherDir = mkdtempSync(join(tmpdir(), 'dsh-dock-m2read-'))
  try {
    // bare array
    writeFileSync(join(launcherDir, EXTRA_ROOTS_FILE),
      JSON.stringify(['C:\\one', 'C:\\two']), 'utf8')
    assert.deepEqual(readExtraRoots(launcherDir), ['C:\\one', 'C:\\two'])
    // object form with a UTF-8 BOM prefix (PowerShell-style) + blank entries
    writeFileSync(join(launcherDir, EXTRA_ROOTS_FILE),
      `\uFEFF${JSON.stringify({ roots: ['C:\\one', '  ', 'C:\\three'] })}`, 'utf8')
    assert.deepEqual(readExtraRoots(launcherDir), ['C:\\one', 'C:\\three'])
    // malformed JSON → empty, never throws
    writeFileSync(join(launcherDir, EXTRA_ROOTS_FILE), '{ nope', 'utf8')
    assert.deepEqual(readExtraRoots(launcherDir), [])
    // absent file → empty
    rmSync(join(launcherDir, EXTRA_ROOTS_FILE))
    assert.deepEqual(readExtraRoots(launcherDir), [])
  } finally {
    rmSync(launcherDir, { recursive: true, force: true })
  }
})

test('M2 moduleRootForUserPath normalizes every entry granularity', () => {
  const launcherDir = mkdtempSync(join(tmpdir(), 'dsh-dock-m2norm-'))
  try {
    // fabricate: installRoot/node_modules/@deepseek-ai/dsh @ 9.9.9-test
    const installRoot = join(launcherDir, 'install')
    makeFakeDsh(installRoot, '9.9.9-test')
    const nmRoot = join(installRoot, 'node_modules')
    const scopeDir = join(nmRoot, '@deepseek-ai')
    const pkgDir = join(scopeDir, 'dsh')

    // node_modules root given directly
    assert.equal(moduleRootForUserPath(nmRoot), nmRoot)
    // install root (contains node_modules)
    assert.equal(moduleRootForUserPath(installRoot), nmRoot)
    // the @deepseek-ai scope dir
    assert.equal(moduleRootForUserPath(scopeDir), nmRoot)
    // the @deepseek-ai/dsh package dir itself
    assert.equal(moduleRootForUserPath(pkgDir), nmRoot)
    // a nonexistent path → null
    assert.equal(moduleRootForUserPath(join(launcherDir, 'nope')), null)
    assert.equal(moduleRootForUserPath(''), null)
  } finally {
    rmSync(launcherDir, { recursive: true, force: true })
  }
})

test('M2 scanCandidates includes a dsh pointed at by extra-roots.json', () => {
  const launcherDir = mkdtempSync(join(tmpdir(), 'dsh-dock-m2scan-'))
  try {
    const fakeVersion = '9.9.9-test'
    const fakePkg = makeFakeDsh(launcherDir, fakeVersion) // launcherDir/node_modules/…dsh
    // point the scan at the fake install root
    writeFileSync(join(launcherDir, EXTRA_ROOTS_FILE),
      JSON.stringify({ roots: [launcherDir] }), 'utf8')

    const { rows } = scanCandidates({ nodePath: NODE, launcherDir, port: 3080 })
    const row = rows.find((r) => r.path === fakePkg)
    assert.ok(row, 'extra-rooted fake dsh must appear as a candidate')
    assert.equal(row.version, fakeVersion)
    assert.equal(row.kind, 'global') // extra roots surface as global installs
  } finally {
    rmSync(launcherDir, { recursive: true, force: true })
  }
})
