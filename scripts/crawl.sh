#!/bin/sh
# Re-downloads the content of the old WordPress site (REST API + rendered HTML of every sitemap URL).
# Usage: sh scripts/crawl.sh <out-dir>     then: node scripts/extract.mjs <out-dir> && node scripts/media.mjs
set -e
OUT="${1:?usage: sh scripts/crawl.sh <out-dir>}"
SITE=https://wcsiasc.org
UA="Mozilla/5.0"
mkdir -p "$OUT/html"
for t in pages posts team awards; do
  p=1
  while :; do
    curl -sfL -A "$UA" "$SITE/wp-json/wp/v2/$t?per_page=100&page=$p" -o "$OUT/${t}_$p.json" || { rm -f "$OUT/${t}_$p.json"; break; }
    p=$((p+1))
  done
done
curl -sL -A "$UA" "$SITE/wp-json/wp/v2/team_category?per_page=100" -o "$OUT/team_cat.json"
curl -sL -A "$UA" "$SITE/wp-json/wp/v2/categories?per_page=100" -o "$OUT/categories.json"
: > "$OUT/urls.txt"
for sm in $(curl -sL -A "$UA" "$SITE/sitemap_index.xml" | grep -o '<loc>[^<]*</loc>' | sed 's/<\/*loc>//g'); do
  curl -sL -A "$UA" "$sm" | grep -o '<loc>[^<]*</loc>' | sed 's/<\/*loc>//g' | grep -v '/wp-content/' >> "$OUT/urls.txt"
done
sort -u "$OUT/urls.txt" -o "$OUT/urls.txt"
while read -r u; do
  n=$(echo "$u" | sed "s#$SITE##; s#/#_#g"); [ -z "$n" ] && n=_
  curl -sL -A "$UA" --max-time 60 "$u" -o "$OUT/html/$n.html"
done < "$OUT/urls.txt"
echo "crawled $(wc -l < "$OUT/urls.txt") urls into $OUT"
