// Where the rebuild is, for the live page (watch.mjs): out/progress.json holds the current stage and its numbers, out/preview.png the
// latest frame. Each step merges what it knows; the recording writes from inside the container, through the same out/ folder.
// From a shell: node progress.mjs <stage> ["what is happening"], or node progress.mjs detail "what is happening" within a stage
import fs from 'node:fs'
import path from 'node:path'

// the project's out/ folder: TRAILER_OUT, set by the CLI (the container gets the same path, since the project is mounted at its own path)
const OUT = (process.env.TRAILER_OUT ?? path.join(process.cwd(), 'out')) + '/'
const FILE = path.join(OUT, 'progress.json')
// the stages in order, with how much of the whole run (about 6 minutes) each one takes, in percent (the recording is most of it)
export const STAGES = [
  ['start', 'Starting', 0], ['build', 'Building the game', 2], ['record', 'Recording a game', 70], ['mux', 'Adding its sound', 1],
  ['moments', 'Finding the moments', 1], ['music', 'Making the music', 2], ['tall', 'Rendering the tall video', 12],
  ['wide', 'Rendering the wide video', 12], ['done', 'Done', 0],
]

const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} } }

export function progress(patch) {
  const p = { ...read(), ...patch, updated: Date.now() }
  if (patch.stage && patch.stage !== read().stage) { p.stageStarted = Date.now(); p.detail = patch.detail ?? null; p.fraction = patch.fraction ?? 0; p.eta = patch.eta ?? null }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(p))
  fs.renameSync(FILE + '.tmp', FILE) // whole files only: the page never reads half a write
}

// a fresh run: forget the last one
export function reset() {
  fs.mkdirSync(OUT, { recursive: true })
  fs.rmSync(path.join(OUT, 'preview.png'), { force: true })
  fs.writeFileSync(FILE, JSON.stringify({ started: Date.now(), stage: 'start', stageStarted: Date.now(), updated: Date.now() }))
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [stage, detail] = process.argv.slice(2)
  if (stage === 'reset') reset()
  else if (stage === 'detail') progress({ detail })
  else if (stage === 'failed') progress({ failed: true, detail: detail ?? null })
  else progress({ stage, detail: detail ?? null, fraction: stage === 'done' ? 1 : 0 })
}
