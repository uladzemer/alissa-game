#!/usr/bin/env bash
# Footsteps for Alice's run, cut from Kenney "Impact Sounds" (CC0).
# Every sample holds its whole step in the first ~0.15 s, the rest is near-silence: that tail must be
# CUT (not loudness-normalised — loudnorm amplified it into a long hiss that made the run sound strange).
# Usage: bash art/make_steps.sh <folder with Kenney impact .ogg files>   → art/sfx/step-*.mp3
set -euo pipefail
SRC="${1:?path to kenney impact-sounds/Audio}"
OUT="$(cd "$(dirname "$0")" && pwd)/sfx"
rm -f "$OUT"/step-*.mp3
cut() { # source, name, length(s)
  ffmpeg -v error -y -i "$SRC/$1.ogg" \
    -af "atrim=0:$3,afade=t=out:st=$(python -c "print($3-0.05)"):d=0.05,dynaudnorm=p=0.9:m=10:f=75,volume=-1dB" \
    -ac 1 -ar 44100 -b:a 80k "$OUT/$2.mp3"
}
for i in 0 1 2 3 4; do
  cut "footstep_grass_00$i" "step-grass$i" 0.15
  cut "footstep_concrete_00$i" "step-stone$i" 0.11
done
ls -l "$OUT"/step-*.mp3
