#!/bin/sh
# Encode the Higgsfield welcome film for the web.
# Usage: FFMPEG=/path/to/ffmpeg sh scripts/film.sh <source.mp4>
# Writes public/film/welcome-1080.mp4, welcome-720.mp4, welcome-poster.webp (first frame), welcome-end.webp (last frame).
set -e
SRC="$1"; FF="${FFMPEG:-ffmpeg}"; OUT="$(dirname "$0")/../public/film"
mkdir -p "$OUT"
"$FF" -v error -y -i "$SRC" -c:v libx264 -preset slow -crf 24 -profile:v high -pix_fmt yuv420p -vf "scale=1920:-2" -c:a aac -b:a 128k -movflags +faststart "$OUT/welcome-1080.mp4"
"$FF" -v error -y -i "$SRC" -c:v libx264 -preset slow -crf 26 -profile:v main -pix_fmt yuv420p -vf "scale=1280:-2" -c:a aac -b:a 96k -movflags +faststart "$OUT/welcome-720.mp4"
"$FF" -v error -y -i "$SRC" -frames:v 1 -vf "scale=1600:-2" -c:v libwebp -quality 72 "$OUT/welcome-poster.webp"
"$FF" -v error -y -sseof -0.1 -i "$SRC" -frames:v 1 -update 1 -vf "scale=1600:-2" -c:v libwebp -quality 72 "$OUT/welcome-end.webp"
ls -la "$OUT"
