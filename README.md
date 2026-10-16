# trailer-kit

Records a game playing itself, frame by frame with its own sound, and edits the footage into two trailers (tall 9:16 and wide 16:9) with Remotion.
The kit knows nothing about any game: a game plugs in with a **config**, a **driver** and an **edit**, all living in the game's own repo.

```
trailer-kit rebuild [project]   build the game, record it, make the music, render and master both trailers (about an hour)
trailer-kit master  [project]   render and master again from the last recording (minutes)
trailer-kit record  [project]   record only
trailer-kit watch   [project]   the live progress page (http://localhost:4321; `rebuild` opens it)
trailer-kit studio  [project]   the edit in Remotion Studio
```

`[project]` is the folder with `trailer.config.json` (default: the current one). Needs Node, ffmpeg, Docker and Colima (the recording runs in
Linux, the only place Chrome renders frame by frame on demand; `rebuild` starts Colima if needed and stops it after).

## What a game provides

A folder (e.g. `mygame/trailer/`) with:

**`trailer.config.json`**
| key | |
|---|---|
| `name`, `url` | the game's name and web address; file names and video titles come from them |
| `build` | `{ "command", "dir" }`: command runs in the project folder, `dir` is the build output the kit serves. Or `"target": "http://..."` for a running page |
| `driver` | the driver module (default `driver.mjs`) |
| `mount` | folder, relative to the project, the container can see (default `.`); needs to reach the game's source if the driver reads it |
| `viewport`, `fps` | the phone screen in CSS pixels and its scale (default 432x768 at 2.5 = 1080x1920), frames per second (60) |
| `edit` | `{ "entry": "src/index.ts", "plan": "src/plan.ts" }`: the Remotion edit. It must register compositions **`Tall`** and **`Wide`**. `plan` is optional: exports `S` (sections, in beats) and `frames()` so the progress page can name the section being drawn |
| `music` | a command, run in the project folder, that writes `out/music.wav` |
| `afterRecord` | a command run after the recording (e.g. list the moments found) |

**`driver.mjs`** (the only code that touches the game)
```js
export async function setup({ page, url, config }) {}   // get the game to its starting screen
export async function play(ctx) {}                      // play until done
// ctx: page, recorder, wait(ms), now(), mark(type, data), drag(from, to), tap(selector), progress(patch), viewport, fps, env
```
`mark()` adds `{ t, type, ...data }` to `out/timeline.json`, which the edit reads to find its moments by what happened, not by time.
`drag` and `tap` move a visible finger (also on the timeline) the way a person would.

**the edit**: a Remotion project (`src/`) that reads `out/gameplay-av.mp4`, `out/timeline.json` and `out/music.wav` (the folder is Remotion's public dir).
The game's `package.json` needs `remotion`, `react`, `@remotion/cli` and `trailer-kit` (`"file:../path/to/trailer-kit"`); keep the Remotion versions equal to the kit's.

Outputs land in `<project>/out/`: `<slug>-trailer-tall.mp4`, `<slug>-trailer-wide.mp4`.

## Notes
- The game's sounds are captured through a replaced `AudioContext` (offline context on the page's virtual clock). A game that doesn't use Web Audio gets a silent recording.
- The container sees the kit and the `mount` folder at their own paths, so paths mean the same inside and out.
