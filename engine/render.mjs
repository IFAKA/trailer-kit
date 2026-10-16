// Renders one trailer of the project's edit (node render.mjs Tall out/raw-tall.mp4), reporting each frame to the live
// page (watch.mjs): how far along it is, which section of the trailer it is drawing, and a still of it now and then.
import fs from 'node:fs'
import path from 'node:path'
import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { progress } from './progress.mjs'
import { config, PROJECT, OUT } from './config.mjs'

const [id, output] = process.argv.slice(2)
const ROOT = PROJECT
const stage = id.toLowerCase()
progress({ stage, detail: 'Bundling the edit' })
const serveUrl = await bundle({ entryPoint: path.join(ROOT, config.edit.entry), publicDir: OUT })
const composition = await selectComposition({ serveUrl, id })

// the section a frame belongs to, by name (the edit's plan module, if it has one: exports S, in beats, and frames())
const plan = await import(path.join(ROOT, config.edit.plan)).catch(() => null)
const sections = plan?.S ? Object.entries(plan.S).map(([name, beat]) => [name, plan.frames(beat)]).sort((a, b) => a[1] - b[1]) : []
const sectionAt = f => sections.findLast(([, start]) => f >= start)?.[0] ?? ''

const t0 = Date.now()
let lastStill = 0, stilling = false
await renderMedia({
  composition, serveUrl, codec: 'h264', outputLocation: output, crf: 16, concurrency: 6, logLevel: 'error',
  imageFormat: 'jpeg', jpegQuality: 95,
  onProgress: ({ renderedFrames, encodedFrames, progress: fraction, stitchStage }) => {
    const total = composition.durationInFrames, real = (Date.now() - t0) / 1000
    progress({
      fraction, frames: renderedFrames, total, encodedFrames, real, eta: fraction > 0.02 ? real * (1 - fraction) / fraction : null,
      detail: stitchStage === 'muxing' ? 'Adding the sound' : `Frame ${renderedFrames} of ${total} · ${sectionAt(renderedFrames)}`,
    })
    // a still of the frame it just drew, every few seconds (drawn on the side, so the render doesn't wait for it)
    if (!stilling && Date.now() - lastStill > 4000 && renderedFrames < total) {
      stilling = true; lastStill = Date.now()
      renderStill({ composition, serveUrl, output: path.join(OUT, 'still.png'), frame: renderedFrames, scale: 0.4, logLevel: 'error' })
        .then(() => { fs.renameSync(path.join(OUT, 'still.png'), path.join(OUT, 'preview.png')); progress({ preview: Date.now() }) }, () => {}).finally(() => { stilling = false })
    }
  },
})
