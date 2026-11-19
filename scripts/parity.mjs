// Compare every page of the old WordPress site with the new build.
// Usage: sh scripts/crawl.sh /tmp/crawl && npm run build && node scripts/parity.mjs /tmp/crawl [docs/PARITY.md]
//
// For each URL in the old sitemaps it checks:
//   page  — does the same path exist in dist/ (all old URLs were kept)
//   text  — share of the old page's sentences (main content only) found on the new page
//   pdfs  — every PDF linked from the old page is linked from the new one
//   imgs  — content images on the old page vs images on the new page
// Writes a Markdown report.
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const crawl = process.argv[2];
const out = process.argv[3] || 'docs/PARITY.md';
if (!crawl) { console.error('usage: node scripts/parity.mjs <crawl-dir> [report.md]'); process.exit(1); }
const DIST = 'dist';
const SITE = 'https://wcsiasc.org';

// pages that intentionally live on the old site only (forms, accounts, theme internals)
const LEGACY_ONLY = [
  /registration-form/, /^\/login\//, /^\/membership/, /^\/account/, /^\/donations\//, /^\/side-panel\//,
  /^\/footer\//, /^\/header\//, /^\/elementor-/, /^\/give\//, /^\/donation-/, /^\/your-profile/, /^\/password-reset/,
  /^\/donor-dashboard/, /^\/check-submission\//, /^\/mega-menu\//, /^\/test\//, /^\/\?footer=/,
];

const norm = (s) => s
  .replace(/[‘’‛′]/g, "'").replace(/[“”„″]/g, '"')
  .replace(/[–—−]/g, '-').replace(/ /g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim().toLowerCase();

function oldContent(html) {
  const $ = cheerio.load(html);
  const main = $('main#main').length ? $('main#main') : $('body');
  main.find('script, style, noscript, form, .side_panel, .wgl-footer, footer, header, .page-header, .elementor-widget-wgl-header-search, .give-form-wrap').remove();
  const blocks = [];
  main.find('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,.elementor-heading-title,.dblh__content,.item__quote,.wgl-accordion_content').each((_, el) => {
    const t = $(el).clone().children('ul,ol').remove().end().text();
    if (t && t.trim()) blocks.push(t);
  });
  const sentences = new Set();
  for (const b of blocks) for (const s of norm(b).split(/(?<=[.!?])\s+(?=[a-z0-9"'(])/)) if (s.length >= 28) sentences.add(s.replace(/[.!?:;,]+$/, ''));
  const pdfs = new Set();
  main.find('a[href$=".pdf"], a[href*=".pdf?"]').each((_, a) => pdfs.add(path.basename(($(a).attr('href') || '').split('?')[0]).toLowerCase()));
  let imgs = 0;
  main.find('img').each((_, im) => { const s = $(im).attr('data-src') || $(im).attr('src') || ''; if (/wp-content\/uploads/.test(s) && !/logo/i.test(s)) imgs++; });
  return { sentences: [...sentences], pdfs: [...pdfs], imgs };
}

function newContent(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  const text = norm($('body').text());
  const pdfs = new Set();
  // local copies are named /docs/<yyyy-mm>-<original name>.pdf
  $('a[href*=".pdf"]').each((_, a) => pdfs.add(path.basename(($(a).attr('href') || '').split('?')[0]).toLowerCase().replace(/^\d{4}-\d{2}-/, '')));
  const imgs = $('main img, body > section img, .wrap img').length || $('img').length;
  return { text, flat: text.replace(/\s+/g, ''), pdfs, imgs };
}

// Titles of other pages (posts, events, people, awards, venues): on the old site they show up in
// "related" / prev-next / sidebar widgets. If one is missing it is navigation, not lost content.
const known = new Set();
for (const f of ['posts', 'events', 'people', 'awards', 'locations', 'galleries']) {
  try {
    for (const x of JSON.parse(fs.readFileSync(`src/data/${f}.json`, 'utf8'))) for (const k of ['title', 'name']) if (x[k]) known.add(norm(String(x[k]).replace(/<[^>]+>/g, '')).replace(/[.!?:;,]+$/, ''));
  } catch {}
}
const MONTH = /\b(january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}, \d{4}/;
const isNav = (s) => known.has(s) || [...known].some((k) => k.length > 20 && (s.includes(k) || k.includes(s))) || (MONTH.test(s) && s.length < 70) || /^(www\.|your email address will not|required fields are marked|view event|read more|prev|next)/.test(s);

const urls = fs.readFileSync(path.join(crawl, 'urls.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const rows = [];
for (const u of urls) {
  const p = u.replace(SITE, '').replace(/^http:\/\/wcsiasc\.org/, '') || '/';
  const file = path.join(crawl, 'html', (p.replace(/\//g, '_') || '_') + '.html');
  const legacyOnly = LEGACY_ONLY.some((re) => re.test(p));
  const distFile = path.join(DIST, decodeURIComponent(p), 'index.html');
  const exists = fs.existsSync(distFile);
  const row = { path: p, legacyOnly, exists, total: 0, found: 0, missing: [], pdfMissing: [], oldImgs: 0, newImgs: 0 };
  if (exists && fs.existsSync(file)) {
    const o = oldContent(fs.readFileSync(file, 'utf8'));
    const n = newContent(fs.readFileSync(distFile, 'utf8'));
    row.total = o.sentences.length;
    row.nav = 0;
    for (const s of o.sentences) {
      // allow small differences: match on the sentence's middle 60 characters
      const probe = s.length > 80 ? s.slice(10, 70) : s;
      if (n.text.includes(probe) || n.flat.includes(probe.replace(/\s+/g, ''))) row.found++;
      else if (isNav(s)) row.nav++;
      else row.missing.push(s);
    }
    row.pdfMissing = o.pdfs.filter((f) => !n.pdfs.has(f));
    row.oldImgs = o.imgs; row.newImgs = n.imgs;
  }
  rows.push(row);
}

// share of real content found (navigation-only misses excluded)
const pct = (r) => { const t = r.total - (r.nav || 0); return t ? Math.round((r.found / t) * 100) : 100; };
const migrated = rows.filter((r) => !r.legacyOnly);
const missingPages = migrated.filter((r) => !r.exists);
const weak = migrated.filter((r) => r.exists && r.missing.length).sort((a, b) => pct(a) - pct(b));
const pdfGaps = migrated.filter((r) => r.pdfMissing.length);
const imgGaps = migrated.filter((r) => r.exists && r.oldImgs >= 4 && r.newImgs < r.oldImgs * 0.6);
const totalS = migrated.reduce((a, r) => a + r.total - (r.nav || 0), 0), foundS = migrated.reduce((a, r) => a + r.found, 0);
const navS = migrated.reduce((a, r) => a + (r.nav || 0), 0);

let md = `# Old site → new site: page-by-page check\n\n`;
md += `Generated by \`scripts/parity.mjs\` on ${new Date().toISOString().slice(0, 10)} from a fresh crawl of ${SITE}.\n\n`;
md += `| | |\n|---|---|\n`;
md += `| Old URLs in sitemaps | ${urls.length} |\n| Kept on the old site on purpose (forms, accounts, theme internals) | ${rows.length - migrated.length} |\n`;
md += `| Migrated URLs that exist on the new site | ${migrated.length - missingPages.length} / ${migrated.length} |\n`;
md += `| Sentences of old main content found on the new pages | ${foundS} / ${totalS} (${totalS ? Math.round((foundS / totalS) * 1000) / 10 : 100}%) |\n`;
md += `| Old sentences that were only navigation (related posts, prev/next, dates in another format) — ignored | ${navS} |\n| Pages with at least one unmatched sentence | ${weak.length} |\n| Pages missing a PDF link | ${pdfGaps.length} |\n\n`;
if (missingPages.length) md += `## Pages missing on the new site\n\n${missingPages.map((r) => `- \`${r.path}\``).join('\n')}\n\n`;
if (weak.length) {
  md += `## Pages where some text did not match\n\nMost misses are reworded headings, buttons or text the new design shows differently; check the examples.\n\n`;
  for (const r of weak) md += `### \`${r.path}\` — ${pct(r)}% (${r.found}/${r.total - (r.nav || 0)})\n\n${r.missing.slice(0, 8).map((s) => `- “${s.slice(0, 160)}${s.length > 160 ? '…' : ''}”`).join('\n')}\n\n`;
}
if (pdfGaps.length) md += `## PDF links not found on the new page\n\n${pdfGaps.map((r) => `- \`${r.path}\`: ${r.pdfMissing.join(', ')}`).join('\n')}\n\n`;
if (imgGaps.length) md += `## Pages with noticeably fewer images\n\n${imgGaps.map((r) => `- \`${r.path}\`: old ${r.oldImgs}, new ${r.newImgs}`).join('\n')}\n\n`;
md += `## Kept on the old site on purpose\n\n${rows.filter((r) => r.legacyOnly).map((r) => `- \`${r.path}\``).join('\n')}\n`;
fs.writeFileSync(out, md);
console.log(`pages ${migrated.length - missingPages.length}/${migrated.length} · text ${foundS}/${totalS} · weak ${weak.length} · pdf gaps ${pdfGaps.length} · img gaps ${imgGaps.length} → ${out}`);
