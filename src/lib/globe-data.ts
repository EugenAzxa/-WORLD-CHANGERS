// Build-time geometry for the interactive globe: a dotted land grid plus the
// outlines of every country where a World Changers event has taken place.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';
import { events, placeList, places } from './data';

const require = createRequire(import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));

// ISO 3166 numeric codes of the countries to highlight (Vatican is too small for the 110m atlas → Italy).
const COUNTRY_IDS: Record<string, number[]> = {
  'Holy See': [380], Italy: [380], Switzerland: [756], 'North Macedonia': [807], Albania: [8],
  'United Arab Emirates': [784], 'Saudi Arabia': [682], Egypt: [818], France: [250], 'United States': [840],
};

let cache: any = null;
export function globeData() {
  if (cache) return cache;
  const countries = (feature(topo, topo.objects.countries) as any).features;
  const land = feature(topo, topo.objects.land) as any;

  // Dotted land: roughly equal-area grid.
  const dots: number[] = [];
  const STEP = 1.55;
  for (let lat = -58; lat <= 82; lat += STEP) {
    const lngStep = STEP / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
    for (let lng = -180; lng < 180; lng += lngStep) {
      if (geoContains(land, [lng, lat])) dots.push(Math.round(lng * 10) / 10, Math.round(lat * 10) / 10);
    }
  }

  const wanted = new Set(placeList.flatMap((p) => COUNTRY_IDS[p.country] || []));
  const highlight = countries.filter((c: any) => wanted.has(Number(c.id)));

  // Places a few km apart would overlap on the globe → show them as one marker.
  const MERGE: Record<string, string> = { rome: 'vatican', 'st-moritz': 'davos' };
  const LABEL: Record<string, Partial<{ name: string; country: string; blurb: string }>> = {
    vatican: { name: 'Vatican City & Rome', country: 'Holy See · Italy', blurb: places.vatican.blurb + ' ' + places.rome.blurb },
    davos: { name: 'Davos & St. Moritz', country: 'Switzerland', blurb: places.davos.blurb + ' ' + places['st-moritz'].blurb },
  };
  const target = (k: string) => MERGE[k] || k;
  const placeOut = placeList.filter((p) => !MERGE[p.key]).map((p) => ({
    key: p.key, name: p.name, country: p.country, code: p.code, lat: p.lat, lng: p.lng, blurb: p.blurb,
    ...LABEL[p.key],
    events: placeList.filter((q) => target(q.key) === p.key).flatMap((q) => q.events.map((e: any) => e.slug)),
  }));
  const eventOut = events
    .filter((e) => e.place && places[e.place])
    .map((e) => ({ slug: e.slug, title: e.title, start: e.start, date: e.dateRange, place: target(e.place), status: e.status, url: e.url, poster: e.posterSm, venue: e.venue, themes: e.themes }))
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

  cache = { dots, highlight: { type: 'FeatureCollection', features: highlight }, places: placeOut, events: eventOut, hub: 'vatican' };
  return cache;
}
