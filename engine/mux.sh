#!/bin/sh
# Puts the game's own sound track under the recorded picture: out/gameplay-av.mp4, the file the edit uses.
set -e
cd "$TRAILER_OUT"
ffmpeg -v error -y -i gameplay.mp4 -i gameplay.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest gameplay-av.mp4
echo "out/gameplay-av.mp4"
