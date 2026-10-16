#!/usr/bin/env node
// trailer-kit <command> [project folder]   (the folder holds trailer.config.json; default: the current one)
//   rebuild   build the game, record it playing itself, make the music, render and master both trailers (about an hour)
//   master    render and master again from the last recording (minutes)
//   record    record only
//   watch     the live progress page
//   studio    the edit in Remotion Studio
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const KIT = path.resolve(path.dirname(fs.realpathSync(new URL(import.meta.url).pathname)), '..')
const [command, dir] = process.argv.slice(2)
const commands = { rebuild: 'rebuild.sh', master: 'master.sh', record: 'record.sh' }
const project = path.resolve(dir ?? process.cwd())
if (!command || !(command in commands || command === 'watch' || command === 'studio')) {
  console.error('usage: trailer-kit rebuild|master|record|watch|studio [project folder]')
  process.exit(2)
}
if (!fs.existsSync(path.join(project, 'trailer.config.json'))) { console.error(`${project} has no trailer.config.json`); process.exit(2) }

const env = { ...process.env, KIT, TRAILER_PROJECT: project, TRAILER_OUT: path.join(project, 'out') }
const run = (cmd, args, opts = {}) => process.exit(spawnSync(cmd, args, { stdio: 'inherit', env, cwd: project, ...opts }).status ?? 1)
if (command === 'watch') run('node', [path.join(KIT, 'engine/watch.mjs'), '--open'])
else if (command === 'studio') {
  const { config } = await import(path.join(KIT, 'engine/config.mjs'))
  run(path.join(KIT, 'node_modules/.bin/remotion'), ['studio', config.edit.entry, '--public-dir=out'])
} else run('sh', [path.join(KIT, 'engine/' + commands[command])])
