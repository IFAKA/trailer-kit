#!/bin/sh
# Renders both trailers from the current recording and masters their sound: -14 LUFS (what YouTube, TikTok and Instagram play at),
# peaks under -1.5 dBFS. The file names and the video title come from trailer.config.json:
# out/<name>-trailer-tall.mp4 (9:16, TikTok/Reels/Shorts/Reddit) and out/<name>-trailer-wide.mp4 (16:9, YouTube/itch.io).
set -e
cd "$TRAILER_PROJECT"
cfg() { node "$KIT/engine/config.mjs" "$1"; }
NAME=$(cfg name); SLUG=$(cfg slug); MUSIC=$(cfg music)
progress() { node "$KIT/engine/progress.mjs" "$@"; }
progress music
if [ -n "$MUSIC" ]; then sh -c "$MUSIC"; fi
for pair in Tall:tall Wide:wide; do
  C=${pair%:*} c=${pair#*:}
  node "$KIT/engine/render.mjs" $C out/raw-$c.mp4 # remotion render, reporting each frame to the live page (watch.mjs)
  progress detail "Mastering the sound: loudness and peaks"
  ffmpeg -v error -y -i out/raw-$c.mp4 -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000" -c:a aac -b:a 256k \
    -metadata title="$NAME trailer" -movflags +faststart "out/$SLUG-trailer-$c.mp4"
  rm out/raw-$c.mp4
  echo "out/$SLUG-trailer-$c.mp4"
done
progress done "out/$SLUG-trailer-tall.mp4 and out/$SLUG-trailer-wide.mp4"
