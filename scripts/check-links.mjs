// Verifies that every internal link and asset referenced in dist/ exists.
import fs from 'node:fs';
import path from 'node:path';
const DIST = path.resolve('dist');
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) { if (!p.includes('/media') && !p.includes('/docs')) walk(p); } else if (p.endsWith('.html')) files.push(p); });
walk(DIST);
const missing = new Map();
const legacy = new Map();
for (const f of files) {
  const html = fs.readFileSync(f, "utf8").replace(/<link rel="canonical"[^>]*>/g, "");
  for (const m of html.matchAll(/(?:href|src)="([^"#?]+)[^"]*"/g)) {
    const u = m[1];
    if (u.startsWith('https://wcsiasc.org')) { legacy.set(u, (legacy.get(u) || 0) + 1); continue; }
    if (!u.startsWith('/') || u.startsWith('//')) continue;
    const target = path.join(DIST, decodeURI(u));
    const ok = fs.existsSync(target) && (fs.statSync(target).isFile() || fs.existsSync(path.join(target, 'index.html')));
    if (!ok) { if (!missing.has(u)) missing.set(u, new Set()); missing.get(u).add(path.relative(DIST, f)); }
  }
}
console.log(`pages: ${files.length}, missing internal targets: ${missing.size}`);
for (const [u, s] of [...missing].slice(0, 40)) console.log('  MISSING', u, '←', [...s].slice(0, 2).join(', '));
console.log(`links to the old site (legacy): ${legacy.size}`);
for (const [u, n] of [...legacy].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log('  LEGACY', n, u);
