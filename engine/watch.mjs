// The live page for a rebuild: http://localhost:4321 shows the stage, how far along it is, the time left, the latest frame (the game
// being recorded, then the trailer being rendered) and the log as it is written. When it's done, both videos play right there.
// rebuild.sh starts it; on its own: node watch.mjs [--open]. It stops by itself half an hour after the rebuild ends.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { STAGES } from './progress.mjs'
import { config, OUT } from './config.mjs'

const PORT = 4321
const ROOT = new URL('.', import.meta.url).pathname
const SLUG = config.slug
const PROGRESS = path.join(OUT, 'progress.json'), LOG = path.join(OUT, 'rebuild.log')
const open = () => exec(`open http://localhost:${PORT}`)
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const size = f => { try { return fs.statSync(f).size } catch { return 0 } }

// a finished video, with byte ranges so the player can seek
function sendVideo(req, res, file) {
  const total = size(file)
  if (!total) { res.writeHead(404).end(); return }
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
  const start = m?.[1] ? +m[1] : 0, end = m?.[2] ? +m[2] : total - 1
  res.writeHead(m ? 206 : 200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': end - start + 1, ...(m && { 'content-range': `bytes ${start}-${end}/${total}` }) })
  fs.createReadStream(file, { start, end }).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(path.join(ROOT, 'watch.html')).pipe(res); return }
  if (url.pathname === '/preview.png') {
    const f = path.join(OUT, 'preview.png')
    if (!size(f)) { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res); return
  }
  const video = /^\/video\/(tall|wide)$/.exec(url.pathname)
  if (video) { sendVideo(req, res, path.join(OUT, `${SLUG}-trailer-${video[1]}.mp4`)); return }
  if (url.pathname === '/events') {
    // server-sent events: the progress whenever it changes, and each new piece of the log
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    res.write(`event: stages\ndata: ${JSON.stringify(STAGES)}\n\n`)
    let sent = '', at = 0
    const tick = () => {
      const p = fs.existsSync(PROGRESS) ? fs.readFileSync(PROGRESS, 'utf8') : ''
      if (p && p !== sent) { sent = p; res.write(`event: progress\ndata: ${p}\n\n`) }
      const n = size(LOG)
      if (n < at) at = 0 // a new run started a new log
      if (n > at) {
        const fd = fs.openSync(LOG, 'r'), buf = Buffer.alloc(Math.min(n - at, 256 * 1024))
        fs.readSync(fd, buf, 0, buf.length, Math.max(at, n - buf.length)); fs.closeSync(fd)
        at = n
        res.write(`event: log\ndata: ${JSON.stringify(buf.toString('utf8'))}\n\n`)
      }
    }
    tick()
    const timer = setInterval(tick, 400)
    req.on('close', () => clearInterval(timer))
    return
  }
  res.writeHead(404).end()
})

server.on('error', e => {
  if (e.code === 'EADDRINUSE') { if (process.argv.includes('--open')) open(); process.exit(0) } // already running: just show it
  throw e
})
server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://localhost:${PORT}`)
  if (process.argv.includes('--open')) open()
})

// half an hour after the rebuild ends (done or failed), stop
setInterval(() => {
  const p = readJSON(PROGRESS)
  if (p && (p.stage === 'done' || p.failed) && Date.now() - p.updated > 30 * 60 * 1000) process.exit(0)
}, 60 * 1000)
