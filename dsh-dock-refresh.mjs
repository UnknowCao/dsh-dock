#!/usr/bin/env node
/**
 * dsh-dock-refresh.mjs — cold-start candidate refresh (T2), invoked by the
 * launcher exe right before a cold start.
 *
 * Re-scans every installed DeepSeek Harness (global prefixes, npx cache,
 * source checkouts), creates per-candidate batch files that are missing, and
 * rewrites candidates.json with the fresh, sorted list. Never rewrites an
 * existing batch whose content is unchanged — "switching DSH" stays a pure
 * exe-side action with zero file writes.
 *
 * The exe runs:  <node> <this-script>
 * This file is DEPLOYED next to candidates.mjs in the launcher dir at plugin
 * activation, so the relative import below always resolves.
 *
 * Exit: 0 with a JSON summary on stdout when the refresh ran.
 */
import { materializeSuite } from './candidates.mjs'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const launcherDir = dirname(fileURLToPath(import.meta.url))

let port = 3080
try {
  const manifest = JSON.parse(readFileSync(join(launcherDir, 'launcher.json'), 'utf8'))
  if (Number.isInteger(manifest.port) && manifest.port > 0) port = manifest.port
} catch { /* manifest absent or stale: default port */ }

const payload = materializeSuite({
  nodePath: process.execPath,
  launcherDir,
  logPath: join(launcherDir, 'dsh-server.log'),
  errPath: join(launcherDir, 'dsh-server.log.err'),
  port,
})

process.stdout.write(JSON.stringify({
  ok: true,
  port,
  candidates: payload.candidates.length,
  npxFallback: payload.npxFallback !== null,
}))
