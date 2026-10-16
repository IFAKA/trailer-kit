#!/bin/sh
# Records the game inside the Linux container (Chrome can't render frame by frame on macOS). Needs KIT, TRAILER_PROJECT, TRAILER_OUT
# (bin/trailer-kit.mjs sets them). The kit, and the folder the config's "mount" names, are mounted at their own paths, so every path
# the driver or the kit computes means the same inside and out.
set -e
MOUNT=$(node "$KIT/engine/config.mjs" mount)
docker run --rm -e TRAILER_PROJECT -e TRAILER_OUT -e MAX_ROUNDS="${MAX_ROUNDS:-99}" -e DEBUG \
  -v "$KIT":"$KIT" -v "$MOUNT":"$MOUNT" -w "$TRAILER_PROJECT" trailer-capture node "$KIT/engine/capture/capture.mjs"
