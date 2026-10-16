#!/bin/sh
# Rebuilds both trailers from the game as it is now, in one go (about an hour): builds the game, records a game in the Linux container,
# finds its moments, makes the music, renders and masters both videos. Run via `trailer-kit rebuild`.
set -e
cd "$TRAILER_PROJECT"
cfg() { node "$KIT/engine/config.mjs" "$1"; }
progress() { node "$KIT/engine/progress.mjs" "$@"; }
# everything it prints also goes to out/rebuild.log, and the live page (http://localhost:4321) shows where it is; WATCH=0 skips the page
mkdir -p out
if [ -z "$REBUILD_LOGGED" ]; then export REBUILD_LOGGED=1; exec sh -c "set -o pipefail; sh '$0' 2>&1 | tee out/rebuild.log"; fi
progress reset
[ "$WATCH" = 0 ] || node "$KIT/engine/watch.mjs" --open >/dev/null 2>&1 &
echo "== $(cfg name) — $(cfg url)"

# the recording runs in Docker under Colima (Chrome renders frame by frame only on Linux); your default Docker context is left alone
mine=$(docker context show 2>/dev/null || true)
started=
if ! colima status >/dev/null 2>&1; then
  echo "== starting Colima"
  colima start --cpu 6 --memory 8
  started=1
  [ -n "$mine" ] && docker context use "$mine" >/dev/null # colima start switches the default context; put yours back
fi
export DOCKER_CONTEXT=colima
# on the way out (done or failed): stop Colima if this script started it, put your Docker context back, keep the exit status
finish() {
  status=$?
  if [ -n "$started" ]; then colima stop >/dev/null 2>&1 || true; [ -n "$mine" ] && env -u DOCKER_CONTEXT docker context use "$mine" >/dev/null 2>&1; fi
  [ $status = 0 ] || progress failed "Stopped with exit status $status: see the log"
  exit $status
}
trap finish EXIT
docker build -q -t trailer-capture "$KIT/engine/capture" >/dev/null

BUILD_CMD=$(node --input-type=module -e "import {config} from '$KIT/engine/config.mjs'; console.log(config.build?.command ?? '')")
if [ -n "$BUILD_CMD" ]; then
  echo "== building the game"
  progress build
  sh -c "$BUILD_CMD"
fi
echo "== recording a game"
sh "$KIT/engine/record.sh"
progress mux
sh "$KIT/engine/mux.sh"
AFTER=$(cfg afterRecord)
if [ -n "$AFTER" ]; then
  echo "== the moments the trailer cuts to"
  progress moments
  sh -c "$AFTER"
fi
echo "== rendering"
sh "$KIT/engine/master.sh"
echo "== done"
