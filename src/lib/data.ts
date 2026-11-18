// Central data layer: loads the extracted JSON and links everything together
// (events ↔ places ↔ people ↔ awards ↔ galleries ↔ press).
import fs from 'node:fs';
import path from 'node:path';
import rawEvents from '../data/events.json';
import rawPeople from '../data/people.json';
import rawAwards from '../data/awards.json';
import rawPosts from '../data/posts.json';
import rawLocations from '../data/locations.json';
import rawPages from '../data/pages.json';
import rawGalleries from '../data/galleries.json';
import rawForms from '../data/forms.json';
import mediaMap from '../data/media.json';
import geo from '../data/geo.json';

/** The old WordPress site. Used for things a static site cannot do (forms, payments, member login). */
export const LEGACY = 'https://wcsiasc.org';
export const SITE = {
  name: 'World Changers Summits',
  short: 'World Changers',
  org: 'Institute for Advance Studies and Cooperation',
  orgShort: 'IASC',
  email: 'world@iascoop.org',
  orgUrl: 'https://iascoop.org/',
  magazine: 'https://iascmag.org/',
  catalogue: `${LEGACY}/3d-flip-book/catalogue/`,
  tagline: 'Uniting visionary experts and inspiring voices to shape the future of our world.',
};

type Any = any;

// ---------------------------------------------------------------- media
const MEDIA = mediaMap as Record<string, { f: string; s: string; w?: number; h?: number }>;
const baseOf = (u: string) => u.replace(/-\d+x\d+(\.\w+)$/i, '$1').replace(/-scaled(\.\w+)$/i, '$1');
export function media(u?: string | null, size: 'f' | 's' = 'f'): string | undefined {
  if (!u) return undefined;
  const m = MEDIA[baseOf(u)];
  return m ? m[size] : u;
}
export function mediaInfo(u?: string | null) {
  if (!u) return undefined;
  return MEDIA[baseOf(u)];
}

const DOCS_DIR = path.resolve('public/docs');
const docs = new Set(fs.existsSync(DOCS_DIR) ? fs.readdirSync(DOCS_DIR) : []);
function docUrl(u: string): string {
  const name = u.split('/wp-content/uploads/')[1]?.replace(/\//g, '-').toLowerCase();
  return name && docs.has(name) ? `/docs/${name}` : u;
}

// ---------------------------------------------------------------- dates
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const TODAY = new Date().toISOString().slice(0, 10);
export function fmtDate(iso?: string | null, opts: { short?: boolean } = {}) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const mon = opts.short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1];
  return `${mon} ${d}, ${y}`;
}
export function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return '';
  if (!end || end === start) return fmtDate(start);
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${MONTHS[m1 - 1]} ${d1}–${d2}, ${y1}`;
  if (y1 === y2) return `${MONTHS[m1 - 1]} ${d1} – ${MONTHS[m2 - 1]} ${d2}, ${y1}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

// ---------------------------------------------------------------- themes
export const THEMES: Record<string, { label: string; re: RegExp; icon: string }> = {
  quantum: { label: 'Quantum', re: /quantum/i, icon: '⚛' },
  ai: { label: 'AI & Technology', re: /artificial intelligence|\bAI\b|neuro-ai|technolog|digital|blockchain|metaverse|cyber|innovation/i, icon: '◈' },
  peace: { label: 'Peace & Faith', re: /peace|faith|holy|pope|\bmass\b|fraternity|interreligious|spiritual|church|basilica|vatican|ethic/i, icon: '✦' },
  health: { label: 'Health & Longevity', re: /biohack|longevity|health|medicine|regenerat/i, icon: '✚' },
  women: { label: 'Women Leadership', re: /women/i, icon: '♀' },
  culture: { label: 'Art & Culture', re: /\bart\b|music|culture|book|literature|perform|gala|festival|reart|polo/i, icon: '♫' },
  economy: { label: 'Economy & Rebuilding', re: /econom|finance|reconstruction|invest|entrepreneur|sustainab/i, icon: '◎' },
};

// ---------------------------------------------------------------- html rewriting
export const knownRoutes = new Set<string>();
const WP_IMG = /https?:\/\/(?:www\.)?wcsiasc\.org\/wp-content\/uploads\/[^"'\s)]+?\.(?:jpe?g|png|webp|gif|svg)/gi;
const WP_PDF = /https?:\/\/(?:www\.)?wcsiasc\.org\/wp-content\/uploads\/[^"'\s)]+?\.pdf/gi;
export function link(href?: string | null): string | undefined {
  if (!href) return undefined;
  if (/^(mailto:|tel:|#)/.test(href)) return href;
  if (/\.pdf$/i.test(href)) return docUrl(href.replace(/^http:/, 'https:'));
  if (/^https?:/.test(href)) {
    const m = href.match(/^https?:\/\/(?:www\.)?wcsiasc\.org(\/.*)?$/);
    if (!m) return href;
    href = m[1] || '/';
  }
  if (href.startsWith('/wp-content/')) return LEGACY + href;
  if (/^\/(media|docs|brand)\//.test(href)) return href; // local assets
  const clean = href.replace(/[?#].*$/, '');
  const norm = clean.endsWith('/') ? clean : clean + '/';
  if (knownRoutes.has(norm)) return norm;
  if (norm === '/events/') return '/events-cat/';
  return LEGACY + href; // page only exists on the old site (forms, login…)
}
export function rewriteHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(WP_IMG, (u) => media(u.replace(/^http:/, 'https:').replace('www.', '')) || u)
    .replace(WP_PDF, (u) => docUrl(u))
    .replace(/href="([^"]+)"/g, (_, h) => `href="${link(h) ?? h}"`);
}
export const textOf = (html?: string) => (html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

// Titles typed in CAPS on the old site → Title Case, keeping acronyms.
const ACRONYMS = new Set(['IASC', 'QBI', 'AI', 'WCS', 'JON', 'REART', 'UN', 'SDG', 'SDGS', 'USA', 'UAE', 'KSSO', 'C4IR', 'WEF', 'DC']);
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
export function niceTitle(t: string) {
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return t;
  return t.split(/(\s+)/).map((w, i) => {
    const core = w.replace(/[^A-Za-z0-9]/g, '');
    if (ACRONYMS.has(core.toUpperCase())) return w;
    const lw = w.toLowerCase();
    if (i > 0 && SMALL.has(core.toLowerCase())) return lw;
    return lw.replace(/[a-z]/, (c) => c.toUpperCase());
  }).join('');
}

// ---------------------------------------------------------------- places
export type Place = { key: string; name: string; country: string; flag: string; lat: number; lng: number; blurb: string; events: Any[] };
const G = geo as Any;
export const places: Record<string, Place> = {};
for (const [key, p] of Object.entries<Any>(G.places)) places[key] = { key, ...p, events: [] };

// ---------------------------------------------------------------- locations (venues)
export const locations = (rawLocations as Any[]).map((l) => ({
  ...l,
  place: G.venues[l.slug] || null,
  name: l.name,
  events: [] as Any[],
}));
const locBySlug = Object.fromEntries(locations.map((l) => [l.slug, l]));

// ---------------------------------------------------------------- galleries
export const galleries = (rawGalleries as Any[]).map((g) => ({ ...g, title: g.title.replace(/\s+Gallery(\s+\d{4})?$/i, '$1').trim(), event: null as Any }));
const galBySlug = Object.fromEntries(galleries.map((g) => [g.slug, g]));

// ---------------------------------------------------------------- people
export const people = (rawPeople as Any[]).map((p) => ({
  ...p,
  events: [] as Any[],
  awards: [] as Any[],
  roles: new Set<string>(),
}));
const personBySlug = Object.fromEntries(people.map((p) => [p.slug, p]));

// ---------------------------------------------------------------- awards
const normName = (s: string) => s.toLowerCase().replace(/\b(dr|prof|sir|h\.e|hon|rev|monsignore|mons|phd|md)\.?\b/g, '').replace(/[^a-z]/g, '');
export const awards = (rawAwards as Any[]).map((a) => ({ ...a, person: null as Any, events: [] as Any[] }));
for (const a of awards) {
  const n = normName(a.name);
  const p = people.find((pp) => normName(pp.name) === n || (n.length > 8 && normName(pp.name).includes(n)));
  if (p) { a.person = p; p.awards.push(a); }
}
const awardBySlug = Object.fromEntries(awards.map((a) => [a.slug, a]));

// ---------------------------------------------------------------- posts
export const CATEGORY_NAMES: Record<string, string> = { 'press-release': 'Press Release', blog: 'Blog', 'you-give-us-courage': 'You Give Us Courage' };
export const posts = (rawPosts as Any[]).map((p) => ({
  ...p,
  title: niceTitle(p.title),
  image: p.image || p.html.match(/<img[^>]+src="([^"]+)"/)?.[1] || null,
  url: `/${p.slug}/`,
}));

// ---------------------------------------------------------------- events
export const events = (rawEvents as Any[]).map((e) => {
  const override = G.events[e.slug];
  const placeKey = override?.place || G.venues[e.location] || null;
  const venue = override?.venue || e.locationName;
  const people: Any[] = [];
  const awardsHere: Any[] = [];
  let gallery: Any = null;
  const docsList: { label: string; href: string }[] = [];
  for (const b of e.blocks) {
    if (b.type === 'people') for (const p of b.people) if (p.slug && personBySlug[p.slug] && !people.includes(personBySlug[p.slug])) people.push(personBySlug[p.slug]);
    if (b.type === 'cards') for (const c of b.items) { const s = c.href?.match(/\/awards\/([^/]+)/)?.[1]; if (s && awardBySlug[s]) awardsHere.push(awardBySlug[s]); }
    if (b.type === 'button' && b.href) {
      const gs = b.href.replace(/^\/|\/$/g, '');
      if (galBySlug[gs] && !gallery) gallery = galBySlug[gs];
      if (/\.pdf$/i.test(b.href)) docsList.push({ label: b.text.replace(/^download\s*/i, '') || 'Document', href: b.href });
    }
  }
  const textForThemes = [e.title, e.description, ...e.blocks.filter((b: Any) => b.type === 'accordion').flatMap((b: Any) => b.items.map((i: Any) => i.title)), textOf(e.blocks.find((b: Any) => b.type === 'html')?.html).slice(0, 600)].join(' ');
  const themes = Object.entries(THEMES).filter(([, t]) => t.re.test(textForThemes)).map(([k]) => k);
  const status = (e.end || e.start) >= TODAY ? 'upcoming' : 'completed';
  return {
    ...e,
    title: niceTitle(e.title),
    url: `/events/${e.slug}/`,
    posterSm: media(e.poster, 's'),
    posterFull: media(e.poster, 'f'),
    year: e.start?.slice(0, 4),
    place: placeKey,
    venue,
    venueSlug: e.location && locBySlug[e.location] ? e.location : null,
    people,
    awards: awardsHere,
    gallery,
    docs: docsList,
    themes,
    status,
    dateRange: fmtRange(e.start, e.end),
  };
});
for (const e of events) {
  if (e.place && places[e.place]) places[e.place].events.push(e);
  if (e.venueSlug) locBySlug[e.venueSlug].events.push(e);
  if (e.gallery && !e.gallery.event) e.gallery.event = e;
  for (const p of e.people) p.events.push(e);
  for (const a of e.awards) a.events.push(e);
}
for (const p of people) {
  for (const c of p.categories) {
    if (c === 'board-of-directors') p.roles.add('Board of Directors');
    else if (c === 'guest') p.roles.add('Guest');
    else if (c.startsWith('speaker')) p.roles.add('Speaker');
    else if (c === 'ambassadors') p.roles.add('Ambassador');
  }
  if (p.awards.length) p.roles.add('Award recipient');
}
export const upcoming = events.filter((e) => e.status === 'upcoming').sort((a, b) => a.start.localeCompare(b.start));
export const completed = events.filter((e) => e.status === 'completed');
export const placeList = Object.values(places).filter((p) => p.events.length).sort((a, b) => b.events.length - a.events.length);
export const countries = [...new Set(placeList.map((p) => p.country))];

// ---------------------------------------------------------------- pages
export const pages = rawPages as Record<string, Any>;
export const forms = rawForms as Any[];

// Generic content pages rendered by [slug].astro
export const GENERIC_PAGES = ['spirit-of-quantum', 'world-changers-economic-summit', 'world-changers-biohacking-summit', 'world-changers-power-womens-summit', 'emotions-revealed', 'formal-award-ceremony-12-of-october', 'yougiveuscourage', 'terms-conditions'];

// ---------------------------------------------------------------- routes (for link rewriting)
[
  '/', '/our-mission/', '/history/', '/about-us/', '/board-of-directors/', '/our-team/', '/contacts/', '/donate/',
  '/events-cat/', '/upcoming-events/', '/completed-events/', '/locations/', '/venue/', '/network-list/', '/speakers/', '/guests/',
  '/gallery/', '/blog/', '/awards/', '/world-map/', '/category/press-release/', '/category/blog/', '/category/you-give-us-courage/',
].forEach((r) => knownRoutes.add(r));
GENERIC_PAGES.forEach((s) => knownRoutes.add(`/${s}/`));
events.forEach((e) => knownRoutes.add(e.url));
locations.forEach((l) => knownRoutes.add(`/events/locations/${l.slug}/`));
people.forEach((p) => knownRoutes.add(`/network/${p.slug}/`));
awards.forEach((a) => knownRoutes.add(`/awards/${a.slug}/`));
posts.forEach((p) => knownRoutes.add(p.url));
galleries.forEach((g) => knownRoutes.add(`/${g.slug}/`));

// ---------------------------------------------------------------- stats
export const stats = {
  events: events.length,
  countries: countries.length,
  cities: placeList.length,
  people: people.length,
  speakers: people.filter((p) => p.roles.has('Speaker')).length,
  awards: awards.length,
  photos: galleries.reduce((s, g) => s + g.images.length, 0),
  press: posts.length,
  firstYear: events.map((e) => e.year).filter(Boolean).sort()[0],
};

export function personRole(p: Any) {
  return p.headline || [...p.roles][0] || '';
}
