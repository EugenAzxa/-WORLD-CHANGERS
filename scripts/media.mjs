// Downloads every image referenced in src/data/*.json from the old WordPress site,
// converts it to optimised WebP (full + small) under public/media/ and writes
// src/data/media.json: { "<original base url>": { f, s, w, h } }.
// Usage: node scripts/media.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DATA = path.resolve('src/data');
const PUB = path.resolve('public/media');
const CACHE = path.resolve('.media-cache');
fs.mkdirSync(PUB, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const RE = /https:\/\/wcsiasc\.org\/wp-content\/uploads\/[^"'\s)]+?\.(?:jpe?g|png|webp|gif|svg)/gi;
const urls = new Set();
for (const f of fs.readdirSync(DATA)) {
  if (!f.endsWith('.json') || f === 'media.json') continue;
  for (const m of fs.readFileSync(path.join(DATA, f), 'utf8').matchAll(RE)) urls.add(m[0]);
}

export const baseOf = (u) => u.replace(/-\d+x\d+(\.\w+)$/i, '$1').replace(/-scaled(\.\w+)$/i, '$1');
const groups = new Map();
for (const u of urls) {
  const b = baseOf(u);
  if (!groups.has(b)) groups.set(b, []);
  groups.get(b).push(u);
}

// Prefer a WordPress-generated variant between 1000 and 2000px (avoids 10MB camera originals).
function pickSource(base, variants) {
  const sized = variants
    .map((u) => ({ u, m: u.match(/-(\d+)x(\d+)\.\w+$/i) }))
    .filter((v) => v.m)
    .map((v) => ({ u: v.u, max: Math.max(+v.m[1], +v.m[2]) }));
  const good = sized.filter((v) => v.max >= 1000 && v.max <= 2000).sort((a, b) => b.max - a.max);
  if (good.length) return [good[0].u, base, ...sized.map((v) => v.u)];
  return [base, ...sized.sort((a, b) => b.max - a.max).map((v) => v.u)];
}

const outName = (base) => {
  const rel = base.split('/wp-content/uploads/')[1]; // 2023/06/name.jpg
  const [y, m, ...rest] = rel.split('/');
  const name = rest.join('-').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${y}-${m}/${name}`;
};

async function download(u) {
  const file = path.join(CACHE, Buffer.from(u).toString('base64url').slice(-120));
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(encodeURI(decodeURI(u)), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return file;
    } catch (e) {
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
  return null;
}

const mapFile = path.join(DATA, 'media.json');
const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
const failed = [];
let done = 0;

async function processOne(base) {
  if (map[base] && fs.existsSync(path.join('public', map[base].f))) { done++; return; }
  const name = outName(base);
  fs.mkdirSync(path.join(PUB, path.dirname(name)), { recursive: true });
  for (const src of pickSource(base, groups.get(base))) {
    const file = await download(src);
    if (!file) continue;
    try {
      if (/\.svg$/i.test(base)) {
        fs.copyFileSync(file, path.join(PUB, name + '.svg'));
        map[base] = { f: `/media/${name}.svg`, s: `/media/${name}.svg` };
        break;
      }
      const img = sharp(file, { animated: false, failOn: 'none' }).rotate();
      const meta = await img.metadata();
      const full = await img.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(PUB, name + '.webp'));
      await img.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toFile(path.join(PUB, name + '-sm.webp'));
      map[base] = { f: `/media/${name}.webp`, s: `/media/${name}-sm.webp`, w: full.width, h: full.height };
      break;
    } catch (e) {
      // corrupt download → try next variant
    }
  }
  if (!map[base]) failed.push(base);
  if (++done % 100 === 0) {
    console.log(`${done}/${groups.size}`);
    fs.writeFileSync(mapFile, JSON.stringify(map));
  }
}

const queue = [...groups.keys()];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await processOne(queue.shift()); }));
fs.writeFileSync(mapFile, JSON.stringify(map));
console.log({ total: groups.size, ok: Object.keys(map).length, failed: failed.length });
if (failed.length) fs.writeFileSync('.media-cache/failed.txt', failed.join('\n'));
