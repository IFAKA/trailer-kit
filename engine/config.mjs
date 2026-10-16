// A game's trailer project is a folder with a trailer.config.json. The kit reads it from here (TRAILER_PROJECT is set by bin/trailer-kit.mjs);
// every path in it is relative to that folder. From a shell: node config.mjs <key>   (prints one value, e.g. slug, out)
import fs from 'node:fs'
import path from 'node:path'

export const PROJECT = path.resolve(process.env.TRAILER_PROJECT ?? process.cwd())
const raw = JSON.parse(fs.readFileSync(path.join(PROJECT, 'trailer.config.json'), 'utf8'))

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const config = {
  name: raw.name,
  url: raw.url,
  slug: slug(raw.name),
  // how to get the game running: build it and serve the folder, or point at a running page (target: "http://...")
  build: raw.build ?? null, // { command, dir }: command runs in the project folder; dir is what gets served
  target: raw.target ?? null,
  // the driver: a module with setup(ctx) and play(ctx); see README
  driver: path.resolve(PROJECT, raw.driver ?? 'driver.mjs'),
  viewport: { width: 432, height: 768, scale: 2.5, ...raw.viewport }, // CSS pixels of the phone screen; scale 2.5 makes 1080x1920
  fps: raw.fps ?? 60,
  // what the container needs to see: the project and, if the driver reads the game's source, a folder above it (relative to the project)
  mount: path.resolve(PROJECT, raw.mount ?? '.'),
  edit: { entry: 'src/index.ts', plan: 'src/plan.ts', ...raw.edit }, // the Remotion edit; compositions "Tall" and "Wide" are rendered; plan exports S and frames (optional)
  music: raw.music ?? null, // a command run in the project folder that writes out/music.wav
  afterRecord: raw.afterRecord ?? null, // a command run in the project folder after the recording (e.g. list the moments)
  expectedSeconds: raw.expectedSeconds ?? 270, // a guess at the recording's length, until there is a previous one
  maxSeconds: raw.maxSeconds ?? 420, // the longest recording (the audio track is allocated for it)
}
export const OUT = path.join(PROJECT, 'out')

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const v = { ...config, out: OUT, project: PROJECT }[process.argv[2]]
  console.log(typeof v === 'object' && v !== null ? JSON.stringify(v) : v ?? '')
}
