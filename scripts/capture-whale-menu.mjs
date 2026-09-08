#!/usr/bin/env node
/**
 * capture-whale-menu.mjs — scripted capture of the Whale Bay (鲸湾) sidebar
 * menu shots for docs/screenshots/, replacing the old manual Win+Shift+S
 * flow in CAPTURE.md §3. Pure Node (>=22): launches a disposable Edge
 * headless with a TEMP profile, drives it over CDP (WebSocket), clicks the
 * real trigger on the live DSH Web GUI, and crops the popup + trigger.
 *
 * Produces (default): menu.png, menu-exit-armed.png  (zh chrome)
 * Probe output includes menu item labels + localStorage keys so the EN
 * capture strategy (--en, see below) can be decided from facts.
 *
 * Security: the auth token is read from the launcher log INSIDE this
 * process and passed only to the local Edge argv; it is never printed,
 * never written to any output file.
 *
 * Usage:
 *   node scripts/capture-whale-menu.mjs            # zh shots (menu.png + menu-exit-armed.png) + probe
 *   node scripts/capture-whale-menu.mjs --en       # also switch the UI language via the real Settings
 *                                                  # dialog, shoot menu-en.png, then restore it
 *   node scripts/capture-whale-menu.mjs --out docs/screenshots
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = (() => {
  const i = process.argv.indexOf('--out')
  return i !== -1 ? process.argv[i + 1] : join(repoDir, 'docs', 'screenshots')
})()
const argOf = (name) => {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : undefined
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('[capture]', ...a)

// ── 1. token URL from the launcher log (never printed in full) ────────────
const logCandidates = [
  join(homedir(), '.dsh', 'launcher', 'dsh-server.log'),
  join(homedir(), '.dsh', 'launcher', 'dsh-server.log.err'),
]
let tokenUrl = null
for (const file of logCandidates) {
  if (!existsSync(file)) continue
  const urls = readFileSync(file, 'utf8').match(/https?:\/\/[^\s"'<>\\]+/g) || []
  const hit = urls.filter(u => /token=/.test(u) && /127\.0\.0\.1|localhost/.test(u)).pop()
  if (hit) { tokenUrl = hit; break }
}
if (tokenUrl === null) {
  console.error('no token URL found in the launcher log — is the DSH server running via dsh-dock?')
  process.exit(1)
}
const masked = tokenUrl.replace(/token=[^&]+/, 'token=***')
log('token URL:', masked)

// ── 2. locate Edge ─────────────────────────────────────────────────────────
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  join(homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
]
const edge = edgeCandidates.find(existsSync)
if (edge === undefined) { console.error('msedge.exe not found'); process.exit(1) }

// ── 3. launch disposable headless Edge ────────────────────────────────────
const profileDir = join(tmpdir(), 'dsh-dock-shot-profile')
rmSync(profileDir, { recursive: true, force: true })
const debugPort = 9333
const child = spawn(edge, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=1280,800',
  tokenUrl,
], { stdio: 'ignore' })
const cleanup = () => { try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* gone */ } }
process.on('exit', cleanup)

// ── 4. CDP over the built-in WebSocket ─────────────────────────────────────
const fetchJson = async (url) => { const r = await fetch(url); return r.json() }
let pageTarget = null
for (let i = 0; i < 60; i += 1) {
  await sleep(500)
  try {
    const list = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`)
    pageTarget = list.find(t => t.type === 'page' && /127\.0\.0\.1|localhost/.test(t.url))
    if (pageTarget !== null) break
  } catch { /* not up yet */ }
}
if (pageTarget === null) { console.error('CDP page target never appeared'); process.exit(1) }
log('page target:', pageTarget.url.replace(/token=[^&]+/, 'token=***'))

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id !== undefined && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id)
    m.error ? p.rej(new Error(`${m.method ?? ''}: ${m.error.message}`)) : p.res(m.result)
  }
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej })
  ws.send(JSON.stringify({ id, method, params }))
})
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails !== undefined) throw new Error(r.exceptionDetails.text)
  return r.result.value
}
await send('Page.enable')
await send('Runtime.enable')

// ── 5. wait for the app + the Whale Bay trigger ────────────────────────────
const FIND = `(() => { const all = [...document.querySelectorAll('button')]; return all.find(b => { const a = b.getAttribute('aria-label') || ''; return a.startsWith('鲸湾') || a.startsWith('Whale Bay') }) })()`
let triggerLabel = null
for (let i = 0; i < 60; i += 1) {
  await sleep(500)
  triggerLabel = await evalJs(`${FIND} ? ${FIND}.getAttribute('aria-label') : null`)
  if (triggerLabel !== null && triggerLabel !== undefined) break
}
if (triggerLabel === null || triggerLabel === undefined) {
  const probe = await evalJs(`JSON.stringify({ title: document.title, buttons: [...document.querySelectorAll('button')].map(b => b.getAttribute('aria-label')).filter(Boolean).slice(0, 25) })`)
  console.error('Whale Bay trigger not found. Page buttons:', probe)
  process.exit(1)
}
log('trigger aria-label:', triggerLabel)

const clipOf = async () => evalJs(`(() => {
  const b = ${FIND}; const m = document.querySelector('.dsh-dock-menu')
  if (!b || !m) return null
  const r1 = m.getBoundingClientRect(), r2 = b.getBoundingClientRect()
  const x = Math.max(0, Math.floor(Math.min(r1.left, r2.left) - 10))
  const y = Math.max(0, Math.floor(Math.min(r1.top, r2.top) - 10))
  const w = Math.ceil(Math.max(r1.right, r2.right) + 10 - x)
  const h = Math.ceil(Math.max(r1.bottom, r2.bottom) + 10 - y)
  return { x, y, width: w, height: h, scale: 1 }
})()`)
const shot = async (name, clip) => {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip !== null ? { clip } : {}) })
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, name), Buffer.from(r.data, 'base64'))
  log(`saved ${name} clip=${clip === null ? 'full' : `${clip.width}x${clip.height}@${clip.x},${clip.y}`}`)
}
const itemLabels = () => evalJs(`JSON.stringify([...document.querySelectorAll('.dsh-dock-menu-item')].map(e => e.textContent.trim()))`)

// optional EN capture (--en): flip the harness display language through the
// REAL Settings dialog (通用设置 → 语言), shoot menu-en.png, then ALWAYS flip
// it back — it is a server-side user preference.
const clickText = (text) => evalJs(`(() => {
  // match elements whose WHOLE text is exactly the label (parents of a bare
  // text node included — value controls often carry a chevron icon child);
  // take the deepest (last in document order) and require layout boxes
  // (works for position:fixed portals, unlike offsetParent).
  const els = [...document.querySelectorAll('body *')].filter(el =>
    el.textContent.trim() === ${JSON.stringify(text)} && el.getClientRects().length > 0)
  if (els.length === 0) return false
  els[els.length - 1].click()
  return true
})()`)
const settingsTrigger = `(() => { const all = [...document.querySelectorAll('button')]; return all.find(b => /^设置$|^Settings$/.test(((b.getAttribute('aria-label') || '') + (b.getAttribute('title') || '') + (b.textContent || '')).trim())) })()`
const openSettings = () => evalJs(`${settingsTrigger} ? (${settingsTrigger}.click(), true) : false`)
const closeSettings = async () => {
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(400)
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^关闭$|^Close$/.test((x.textContent || '').trim())); if (b) b.click(); return true })()`)
  await sleep(400)
}
async function setLanguage(currentLabel, optionLabel) {
  if (!(await openSettings())) throw new Error('settings trigger not found')
  // the dialog animates in — poll for the current value leaf instead of one shot
  let opened = false
  for (let i = 0; i < 20 && !opened; i += 1) {
    await sleep(500)
    opened = await clickText(currentLabel)
  }
  if (!opened) {
    const diag = await evalJs(`JSON.stringify({
      dialog: !!document.querySelector('[role=dialog]'),
      visibleTexts: [...document.querySelectorAll('body *')]
        .filter(e => e.childElementCount === 0 && e.getClientRects().length > 0)
        .map(e => e.textContent.trim()).filter(t => t.length > 0 && t.length < 30).slice(0, 90),
    })`)
    throw new Error(`language value "${currentLabel}" not found; diag=${diag}`)
  }
  await sleep(500)
  // pick the option (English / 中文) from whatever popover appeared
  let picked = false
  for (let i = 0; i < 6 && !picked; i += 1) {
    picked = await clickText(optionLabel)
    if (!picked) await sleep(500)
  }
  await sleep(800)
  return picked
}
if (process.argv.includes('--en')) {
  let captured = false
  try {
    const picked = await setLanguage('中文', 'English')
    log('language option picked:', picked)
    // wait for the chrome to re-render in English (dsh-dock subscribes to locale)
    for (let i = 0; i < 20; i += 1) {
      await sleep(500)
      triggerLabel = await evalJs(`${FIND} ? ${FIND}.getAttribute('aria-label') : null`)
      if (triggerLabel !== null && triggerLabel !== undefined && triggerLabel.startsWith('Whale Bay')) break
    }
    log('trigger after switch:', triggerLabel)
    if (triggerLabel === null || triggerLabel === undefined || !triggerLabel.startsWith('Whale Bay')) {
      throw new Error('UI did not switch to English: ' + triggerLabel)
    }
    await closeSettings()
    await evalJs(`${FIND}.click()`)
    await sleep(550)
    const labelsEn = JSON.parse(await itemLabels())
    log('menu items (en):', labelsEn)
    const clipEn = await clipOf()
    await shot('menu-en.png', clipEn)
    await evalJs(`${FIND}.click()`) // close menu
    captured = true
  } finally {
    // restore ONLY if the language actually flipped (avoid false alarms)
    const nowLabel = await evalJs(`${FIND} ? ${FIND}.getAttribute('aria-label') : null`)
    if (nowLabel !== null && nowLabel !== undefined && nowLabel.startsWith('Whale Bay')) {
      try {
        const back = await setLanguage('English', '中文')
        await closeSettings()
        const restored = await evalJs(`${FIND} ? ${FIND}.getAttribute('aria-label') : null`)
        log('language restored:', back, '→', restored)
      } catch (e) {
        log('RESTORE FAILED — set the language back manually in Settings:', e.message)
      }
    } else {
      log('language never switched; nothing to restore')
    }
  }
  if (!captured) process.exit(1)
}

// optional settings-page capture (--settings): open the real Settings dialog,
// switch to the "DSH Dock（启动器）" section, shoot the dialog (settings-section.png)
if (process.argv.includes('--settings')) {
  if (!(await openSettings())) { console.error('settings trigger not found'); process.exit(1) }
  let clicked = false
  for (let i = 0; i < 20 && !clicked; i += 1) {
    await sleep(500)
    clicked = (await clickText('DSH Dock（启动器）')) || (await clickText('DSH Dock (launcher)'))
  }
  if (!clicked) { console.error('DSH Dock settings section not found'); process.exit(1) }
  // wait until the section's toggles actually render
  let ready = false
  for (let i = 0; i < 20 && !ready; i += 1) {
    await sleep(500)
    ready = await evalJs(`(() => {
      const vis = [...document.querySelectorAll('[role=dialog] *')]
        .filter(e => e.childElementCount === 0 && e.getClientRects().length > 0)
        .map(e => e.textContent.trim())
      return vis.some(t => t === '托盘常驻' || t === 'Tray residency')
    })()`)
  }
  log('settings section ready:', ready)
  if (!ready) { console.error('section toggles never rendered'); process.exit(1) }
  const clip = await evalJs(`(() => {
    const d = document.querySelector('[role=dialog]')
    if (!d) return null
    const r = d.getBoundingClientRect()
    return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.round(r.width), height: Math.round(r.height), scale: 1 }
  })()`)
  await shot('settings-section.png', clip)
  await closeSettings()
}

// ── 6. shot 1: the open menu (menu.png / menu-en.png) ─────────────────────
// re-read the CURRENT trigger label (the --en block restores the language
// but leaves this variable stale — without this, a zh menu would overwrite
// menu-en.png with the wrong chrome)
triggerLabel = await evalJs(`${FIND} ? ${FIND}.getAttribute('aria-label') : null`)
await evalJs(`${FIND}.click()`)
await sleep(550) // 300ms pop animation + settle
const labels1 = JSON.parse(await itemLabels())
log('menu items:', labels1)
const clip1 = await clipOf()
const menuName = triggerLabel.startsWith('Whale Bay') ? 'menu-en.png' : 'menu.png'
await shot(menuName, clip1)

// ── 7. shot 2: armed exit confirm (menu-exit-armed.png) ───────────────────
// FIRST click on the last item (归湾/To the Bay) only ARMS it (two-step
// guard). We never click twice — that would really stop the server.
await evalJs(`(() => { const items = [...document.querySelectorAll('.dsh-dock-menu-item')]; items[items.length - 1].click(); return items.length })()`)
await sleep(300)
const labels2 = JSON.parse(await itemLabels())
log('armed items:', labels2)
const clip2 = await clipOf()
await shot('menu-exit-armed.png', clip2)

// close the menu (second trigger click toggles it closed) — leave the page clean
await evalJs(`${FIND}.click()`)

// ── 8. probe for the EN-capture decision + report ─────────────────────────
const probe = await evalJs(`JSON.stringify({
  lang: navigator.language,
  localStorageKeys: Object.keys(localStorage),
  newCodeLive: document.body.innerHTML.includes('dsh-dock'),
})`)
log('probe:', probe)
log('done.')
ws.close()
process.exit(0)
