#!/usr/bin/env node
/**
 * regen-launcher.mjs — regenerate the DSH desktop-launcher suite from the
 * plugin source, outside the harness. Run after editing index.js (the baked
 * start-server.cmd / launcher.ini recipe: node path, server args, working
 * dir) or after rebuilding assets/dsh-dock-launcher.exe.
 *
 *   node regen-launcher.mjs [--name "DSH Harness"] [--port 3080]
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const plugin = await import('./index.js')

const args = process.argv.slice(2)
const name = args.includes('--name') ? args[args.indexOf('--name') + 1] : undefined
const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : undefined

const node = plugin.detectNode()
const recipe = plugin.detectStartRecipe(node)
if (port !== undefined) {
  const at = recipe.serverArgs.indexOf('web')
  recipe.serverArgs = [...recipe.serverArgs.slice(0, at + 2), '--port', String(port)]
}
const options = {
  shortcutName: name ?? plugin.DEFAULT_SHORTCUT_NAME,
  host: plugin.DEFAULT_HOST,
  port: port ?? plugin.DEFAULT_PORT,
  nodePath: recipe.nodePath,
  serverArgs: recipe.serverArgs,
  workingDirectory: recipe.workingDirectory,
}

mkdirSync(plugin.LAUNCHER_DIR, { recursive: true })
writeFileSync(plugin.BATCH_FILE, plugin.buildStartBatch(options), 'utf8')
writeFileSync(plugin.INI_FILE, plugin.buildLauncherIni(options), 'utf8')
plugin.ensureDockIcon()
plugin.copyLauncherExe()
plugin.removeLegacyFiles()
const desktopExe = plugin.placeDesktopExe(options)

console.log(`node:         ${recipe.nodePath}`)
console.log(`server args:  ${recipe.serverArgs.join(' ')}`)
console.log(`working dir:  ${recipe.workingDirectory}`)
console.log(`launcher dir: ${plugin.LAUNCHER_DIR}`)
console.log(`desktop exe:  ${desktopExe}`)
