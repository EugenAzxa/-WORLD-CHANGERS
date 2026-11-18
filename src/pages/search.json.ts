import { events, people, posts, galleries, locations, awards, places, media, personRole, textOf, fmtDate } from '../lib/data';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function GET() {
  const items = [
    ...events.map((e) => ({ t: e.title, u: e.url, k: 'Event', d: `${e.dateRange}${e.place ? ' · ' + places[e.place].name : ''}`, i: e.posterSm, x: `${e.venue || ''} ${e.place ? places[e.place].country : ''}` })),
    ...people.map((p) => ({ t: p.name, u: `/network/${p.slug}/`, k: 'Person', d: personRole(p), i: media(p.image, 's'), x: '' })),
    ...locations.map((l) => ({ t: l.name, u: `/events/locations/${l.slug}/`, k: 'Venue', d: l.address || '', i: media(l.image, 's'), x: '' })),
    ...posts.map((p) => ({ t: p.title, u: p.url, k: 'Article', d: fmtDate(p.date), i: media(p.image, 's'), x: textOf(p.html).slice(0, 200) })),
    ...galleries.map((g) => ({ t: `${g.title} — Gallery`, u: `/${g.slug}/`, k: 'Gallery', d: `${g.images.length} photos`, i: media(g.images[0]?.src, 's'), x: '' })),
    ...awards.map((a) => ({ t: `${a.name} — Award`, u: `/awards/${a.slug}/`, k: 'Award', d: 'World Changers Award', i: media(a.image, 's'), x: '' })),
    ...[['World Map', '/world-map/'], ['Our Mission', '/our-mission/'], ['History', '/history/'], ['Board of Directors', '/board-of-directors/'], ['Donate', '/donate/'], ['Contact', '/contacts/'], ['Spirit of Quantum — Patron', '/spirit-of-quantum/']].map(([t, u]) => ({ t, u, k: 'Page', d: '', i: undefined, x: '' })),
  ].map(({ x, ...it }) => ({ ...it, s: norm(`${it.t} ${it.d || ''} ${x}`) }));
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
}
