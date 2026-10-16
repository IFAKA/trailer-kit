// Plays a game by itself through its driver and records it frame by frame: out/gameplay.mp4 (the page, at the project's viewport),
// out/gameplay.wav (the game's own Web Audio sounds, in sync) and out/timeline.json (what the driver marked, and where the finger was,
// for the edit). Runs inside the Linux container (see bin/trailer-kit.mjs): Chrome only renders frame by frame on demand there.
//
// The driver (config.driver) is a module with:
//   export async function setup({ page, url, config })   // get the game to its starting screen (storage, clicks, waiting)
//   export async function play(ctx)                        // play until done; ctx has what the driver needs (see below)
// ctx: page, recorder, wait(ms), now() (ms since recording started), mark(type, data) (adds {t, type, ...data} to the timeline),
//      drag(fromSelector, toSelector), tap(selector), progress(patch), viewport, fps, env
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { capture, launch, PuppeteerCaptureFormat } from 'puppeteer-capture'
import { progress } from './../progress.mjs'
import { config, OUT, PROJECT } from './../config.mjs'

const driver = await import(config.driver)
const { width: W, height: H, scale: SCALE } = config.viewport
const FPS = config.fps
fs.mkdirSync(OUT, { recursive: true })
// the last recording's length, to guess how far along this one is (a driver that plays the same game gets much the same length each time)
const EXPECTED = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'timeline.json'), 'utf8')).seconds } catch { return config.expectedSeconds } })()
progress({ stage: 'record', detail: 'Opening the game' })

// the built game, served locally (module scripts don't load from file://), unless the config points at a running page
let server = null, url = config.target
if (!url) {
  if (!config.build) throw new Error('trailer.config.json needs "build": { "command", "dir" } or "target": a URL')
  const BUILD = path.resolve(PROJECT, config.build.dir)
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' }
  server = http.createServer((req, res) => {
    const p = path.join(BUILD, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(BUILD, 'index.html')
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' })
    fs.createReadStream(f).pipe(res)
  }).listen(4173)
  url = 'http://localhost:4173/'
}

// The game's sounds go into an offline audio context instead of the speakers. Its clock is the page's (virtual) clock, so every
// sound lands in the track exactly when it happened in the video. Sounds made before recording starts land in the pre-roll and are cut.
const PRE = 5, LEN = config.maxSeconds, SR = 48000
const audioHook = `(() => {
  let ctx = null
  window.__audio = { t0: null }
  const Offline = OfflineAudioContext
  window.AudioContext = window.webkitAudioContext = function () {
    if (!ctx) ctx = new Offline(2, ${SR} * ${PRE + LEN}, ${SR})
    window.__audio.ctx = ctx
    return new Proxy(ctx, { get(t, p) {
      if (p === 'currentTime') { const t0 = window.__audio.t0; return t0 === null ? 0.01 : ${PRE} + (performance.now() - t0) / 1000 }
      if (p === 'state') return 'running'
      if (p === 'resume' || p === 'suspend') return () => Promise.resolve()
      const v = Reflect.get(t, p, t)
      return typeof v === 'function' ? v.bind(t) : v
    } })
  }
})()`

// the headless Chromium the container's image ships with
const shellRoot = '/ms-playwright'
const shellDir = fs.readdirSync(shellRoot).find(d => d.startsWith('chromium_headless_shell-'))
const shellBin = fs.readdirSync(path.join(shellRoot, shellDir)).find(d => d.startsWith('chrome-headless-shell-'))
const browser = await launch({
  executablePath: path.join(shellRoot, shellDir, shellBin, 'chrome-headless-shell'),
  args: ['--no-sandbox', '--font-render-hinting=none', `--force-device-scale-factor=${SCALE}`],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE, isMobile: true, hasTouch: false })
const recorder = await capture(page, {
  fps: FPS,
  format: PuppeteerCaptureFormat.MP4('slow'),
  customFfmpegConfig: async ff => { ff.outputOptions(['-crf 12', '-pix_fmt yuv420p']) },
})
await page.evaluateOnNewDocument(audioHook)
// The recorder runs the page's requestAnimationFrame callbacks itself, so Chrome sees no frame callback and skips the main-thread
// animation update on frames where only composited animations move: element.animate(...).finished would never resolve.
// One real, empty frame callback keeps that update running every frame.
await page.evaluateOnNewDocument(`(() => {
  const raf = window.__PuppeteerCaptureViaHeadlessExperimental?.window_requestAnimationFrame
  if (raf) { const loop = () => raf(loop); raf(loop) }
})()`)
page.on('pageerror', e => console.error('page error:', e.message))

await page.goto(url, { waitUntil: 'networkidle0' })
await driver.setup({ page, url, config })

const timeline = []
const now = () => page.evaluate(() => performance.now() - window.__audio.t0)
const wait = ms => recorder.waitForTimeout(ms)
const center = sel => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
const mark = async (type, data = {}) => { const t = await now(); timeline.push({ t, type, ...data }); return t }
let finger = { x: W / 2, y: H * 0.9 }
const point = async (x, y, down) => { finger = { x, y }; await page.mouse.move(x, y); await mark('finger', { x, y, down }) }

// a hand moves a card the way a person does: a short reach, a press, an eased arc to the lane, a release
async function drag(from, to) {
  const a = await center(from), b = await center(to)
  const reach = 14
  for (let i = 1; i <= reach; i++) { const e = 1 - (1 - i / reach) ** 3; await point(finger.x + (a.x - finger.x) * e, finger.y + (a.y - finger.y) * e, false); await wait(1000 / FPS) }
  await page.mouse.down(); await mark('press', { x: a.x, y: a.y })
  await wait(120)
  const steps = 30
  for (let i = 1; i <= steps; i++) {
    const p = i / steps, e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2
    await point(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e - Math.sin(Math.PI * p) * 18, true)
    await wait(1000 / FPS)
  }
  await wait(60)
  await page.mouse.up(); await mark('release', { x: b.x, y: b.y })
}
async function tap(sel) {
  const a = await center(sel)
  for (let i = 1; i <= 14; i++) { const e = 1 - (1 - i / 14) ** 3; await point(finger.x + (a.x - finger.x) * e, finger.y + (a.y - finger.y) * e, false); await wait(1000 / FPS) }
  await page.mouse.down(); await mark('press', { x: a.x, y: a.y })
  await wait(90)
  await page.mouse.up(); await mark('release', { x: a.x, y: a.y })
}
const key = g => `${g.stage}|${g.round}|${g.log.length}|${g.units.length}|${g.P.hand.length}|${g.P.elixir}`
async function settled(before) {
  for (let i = 0; i < 60; i++) { await wait(50); const g = await game(); if (key(g) !== before) return g }
  return game()
}


// the frame clock starts at the machine's monotonic time: from 0, Chrome ignores it and CSS animations run on the real clock
recorder._frameTimeTicks = Number(process.hrtime.bigint() / 1000n) / 1000
await recorder.start(path.join(OUT, 'gameplay.mp4'))
await page.evaluate(() => { window.__audio.t0 = performance.now() })
const t0 = Date.now()
// for the live page: one frame a second of video as out/preview.png
recorder.on('frameCaptured', (i, _ts, data) => {
  if (i % FPS) return
  fs.writeFileSync(path.join(OUT, 'preview.png.tmp'), data); fs.renameSync(path.join(OUT, 'preview.png.tmp'), path.join(OUT, 'preview.png'))
  const video = i / FPS, real = (Date.now() - t0) / 1000, fraction = Math.min(0.99, video / EXPECTED)
  progress({ fraction, video, expected: EXPECTED, frames: i, real, eta: video > 3 ? Math.max(0, (EXPECTED - video) * real / video) : null, preview: Date.now() })
})
await driver.play({ page, recorder, wait, now, mark, drag, tap, progress, viewport: config.viewport, fps: FPS, env: process.env, t0 })
const seconds = (await now()) / 1000
await recorder.stop()
await recorder.detach()
console.log(`video: ${seconds.toFixed(1)}s in ${((Date.now() - t0) / 1000).toFixed(0)}s real`)
progress({ fraction: 0.99, detail: 'Saving the game\'s sound track', eta: null })

// render the sound track for the recorded span and save it as 16-bit stereo WAV
const frames = Math.ceil(seconds * SR)
await page.evaluate(async () => { const c = window.__audio.ctx; if (c) window.__audio.buf = await c.startRendering() })
const pcm = Buffer.alloc(frames * 4)
const CHUNK = SR * 10
for (let s = 0; s < frames; s += CHUNK) {
  const b64 = await page.evaluate((from, n) => {
    const b = window.__audio.buf, out = new Int16Array(n * 2)
    if (b) {
      const l = b.getChannelData(0), r = b.getChannelData(1)
      for (let i = 0; i < n; i++) { out[2 * i] = Math.max(-1, Math.min(1, l[from + i] ?? 0)) * 32767; out[2 * i + 1] = Math.max(-1, Math.min(1, r[from + i] ?? 0)) * 32767 }
    }
    let s = ''; const u = new Uint8Array(out.buffer)
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  }, PRE * SR + s, Math.min(CHUNK, frames - s))
  Buffer.from(b64, 'base64').copy(pcm, s * 4)
}
const head = Buffer.alloc(44)
head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8); head.write('fmt ', 12)
head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28)
head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40)
fs.writeFileSync(path.join(OUT, 'gameplay.wav'), Buffer.concat([head, pcm]))
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ fps: FPS, width: W, height: H, scale: SCALE, seconds, timeline }, null, 1))
console.log('done')
await browser.close()
server?.close()
