// Intro sequence: dotted world map → Vatican → chronological arcs to every host city
// → totals and headline → wipe to the page. Driven by one rAF timeline.
import { geoNaturalEarth1 } from 'd3-geo';

type P = { key: string; name: string; code: string; lat: number; lng: number };
type Step = { year: string; title: string; place: string; date: string; country: string };
type Data = { dots: number[]; hub: string; places: P[]; steps: Step[]; totals: { people: number; events: number; countries: number } };

const T_DOTS = 900;        // map draws in
const T_HUB = 900;         // Vatican lights up
const T_JOURNEY = 1700;    // first arc starts
const JOURNEY_LEN = 4300;  // all gatherings
const T_FINAL_GAP = 500;
const FINAL_HOLD = 2300;
const ARC_MS = 520;

export function mountIntro() {
  const root = document.querySelector<HTMLElement>('[data-intro]');
  if (!root || !document.documentElement.classList.contains('intro-on')) return;
  try { sessionStorage.setItem('wcs-intro', '1'); } catch {}

  const data: Data = JSON.parse(root.querySelector('script[type="application/json"]')!.textContent!);
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const labelsEl = root.querySelector<HTMLElement>('.intro-labels')!;
  const yearEl = root.querySelector<HTMLElement>('[data-year]')!;
  const captionEl = root.querySelector<HTMLElement>('[data-caption]')!;
  const counters = Object.fromEntries([...root.querySelectorAll<HTMLElement>('[data-c]')].map((el) => [el.dataset.c!, el]));
  const lineEl = root.querySelector<HTMLElement>('[data-line]')!;

  const css = getComputedStyle(document.documentElement);
  const INK = css.getPropertyValue('--globe-ink').trim() || '17, 17, 17';
  const ACCENT = css.getPropertyValue('--globe-accent').trim() || '31, 90, 61';
  const BG = css.getPropertyValue('--color-bg').trim() || '#f5f2ec';

  // split the headline into words for a staggered reveal
  lineEl.innerHTML = lineEl.innerHTML.split(/(\s+)/).map((w) => (w.trim() ? `<span class="w">${w}</span>` : w)).join('');
  const words = [...lineEl.querySelectorAll<HTMLElement>('.w')];

  const placeByKey = Object.fromEntries(data.places.map((p) => [p.key, p]));
  const hub = placeByKey[data.hub];

  // ---------- timeline of events
  const steps = data.steps;
  const stepTime = (i: number) => T_JOURNEY + (steps.length > 1 ? (i / (steps.length - 1)) * JOURNEY_LEN : 0);
  const firstVisit = new Map<string, number>(); // place → time of first event
  steps.forEach((s, i) => { if (!firstVisit.has(s.place)) firstVisit.set(s.place, stepTime(i)); });
  firstVisit.set(hub.key, Math.min(firstVisit.get(hub.key) ?? T_HUB, T_HUB));
  const T_FINAL = T_JOURNEY + JOURNEY_LEN + T_FINAL_GAP;
  const T_END = T_FINAL + FINAL_HOLD;

  // ---------- layout
  let W = 0, H = 0, DPR = 1;
  const projection = geoNaturalEarth1();
  let dots: { x: number; y: number; d: number }[] = [];
  let pts: Record<string, [number, number]> = {};
  function layout() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const mobile = W < 700;
    const top = mobile ? 90 : 96, bottom = mobile ? 250 : 200;
    projection.fitExtent([[24, top], [W - 24, H - bottom]], { type: 'Sphere' } as any);
    // zoom gently on Europe/Middle East where most gatherings are
    const s = projection.scale();
    projection.scale(s * (mobile ? 1.9 : 1.6)).center([mobile ? 18 : 12, mobile ? 36 : 34]).translate([W / 2, top + (H - top - bottom) / 2]);
    dots = [];
    for (let i = 0; i < data.dots.length; i += 2) {
      const p = projection([data.dots[i], data.dots[i + 1]]);
      if (!p || p[0] < -10 || p[0] > W + 10 || p[1] < top - 20 || p[1] > H + 10) continue;
      dots.push({ x: p[0], y: p[1], d: (p[0] / W) * 650 + Math.random() * 120 });
    }
    pts = Object.fromEntries(data.places.map((p) => [p.key, projection([p.lng, p.lat]) as [number, number]]));
    buildLabels();
  }

  // ---------- DOM labels with simple collision avoidance
  const labelNodes: Record<string, HTMLElement> = {};
  function buildLabels() {
    labelsEl.innerHTML = '';
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const order = [hub.key, ...[...firstVisit.keys()].filter((k) => k !== hub.key)];
    for (const key of order) {
      const p = placeByKey[key]; const xy = pts[key];
      if (!p || !xy) continue;
      const el = document.createElement('span');
      el.className = 'intro-label' + (key === hub.key ? ' hub' : '');
      el.innerHTML = `<i>${p.code}</i>${p.name}`;
      el.style.left = `${xy[0]}px`; el.style.top = `${xy[1]}px`;
      labelsEl.appendChild(el);
      const w = el.offsetWidth + 14, h = el.offsetHeight + 4;
      const right = { x: xy[0] + 10, y: xy[1] - h / 2, w, h };
      const left = { x: xy[0] - 10 - w, y: xy[1] - h / 2, w, h };
      const hit = (r: any) => r.x < 0 || r.x + r.w > W || placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
      if (!hit(right)) placed.push(right);
      else if (!hit(left)) { placed.push(left); el.classList.add('left'); }
      else { el.remove(); continue; }
      labelNodes[key] = el;
    }
  }

  // ---------- drawing
  const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  function arc(a: [number, number], b: [number, number], k: number, alpha: number) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const cx = mx, cy = my - Math.min(160, dist * 0.35);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    const N = 40, end = Math.max(1, Math.round(N * k));
    for (let i = 1; i <= end; i++) {
      const t = i / N;
      const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0];
      const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1];
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${ACCENT},${alpha})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  function draw(t: number) {
    ctx.clearRect(0, 0, W, H);
    const dim = t > T_FINAL ? 1 - 0.75 * ease((t - T_FINAL) / 600) : 1;

    // land dots sweep in from the west
    ctx.fillStyle = `rgb(${INK})`;
    for (const d of dots) {
      const k = ease((t - d.d) / 400);
      if (k <= 0) continue;
      ctx.globalAlpha = 0.38 * k * dim;
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.25, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // arcs from the Vatican to each newly visited city
    const hubXY = pts[hub.key];
    for (const [key, t0] of firstVisit) {
      if (key === hub.key || t < t0) continue;
      const k = ease((t - t0) / ARC_MS);
      arc(hubXY, pts[key], k, 0.75 * dim);
    }

    // city markers
    for (const [key, t0] of firstVisit) {
      if (t < t0) continue;
      const appear = key === hub.key ? t0 : t0 + ARC_MS * 0.8;
      const k = ease((t - appear) / 350);
      if (k <= 0) continue;
      const [x, y] = pts[key];
      const r = (key === hub.key ? 7 : 5) * k;
      // pulse ring right after landing
      const since = t - appear;
      if (since < 1200) {
        const pr = r + (since / 1200) * 22;
        ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ACCENT},${(1 - since / 1200) * 0.7 * dim})`; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.globalAlpha = dim;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${ACCENT})`; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = BG; ctx.stroke();
      ctx.globalAlpha = 1;
      if (k > 0.6) labelNodes[key]?.classList.add('on');
    }
  }

  // ---------- captions and counters
  const seenCountries = new Set<string>();
  const seenCities = new Set<string>();
  let shown = -1;
  function updateText(t: number) {
    if (t >= T_HUB && shown < 0) {
      yearEl.textContent = '2023';
      captionEl.textContent = 'Vatican City — the Pontifical Academy of Sciences';
    }
    while (shown + 1 < steps.length && t >= stepTime(shown + 1)) {
      shown++;
      const s = steps[shown];
      seenCountries.add(s.country); seenCities.add(s.place);
      yearEl.textContent = s.year;
      captionEl.textContent = `${placeByKey[s.place].name} — ${s.title}`;
      counters.events.textContent = String(shown + 1);
      counters.countries.textContent = String(seenCountries.size);
      counters.cities.textContent = String(seenCities.size);
    }
    if (t >= T_FINAL && !root!.classList.contains('final')) {
      root!.classList.add('final');
      words.forEach((w, i) => setTimeout(() => w.classList.add('on'), 250 + i * 70));
    }
  }

  // ---------- run / exit
  let start = 0, raf = 0, done = false;
  function frame(now: number) {
    if (!start) start = now;
    const t = now - start;
    draw(t);
    updateText(t);
    if (t >= T_END) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }
  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    root!.classList.add('leaving');
    setTimeout(() => {
      document.documentElement.classList.remove('intro-on');
      root!.remove();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', layout);
    }, 900);
  }
  const onKey = (e: KeyboardEvent) => { if (['Escape', 'Enter', ' ', 'ArrowDown', 'PageDown'].includes(e.key)) { e.preventDefault(); finish(); } };
  root.addEventListener('click', finish);
  root.addEventListener('wheel', finish, { passive: true });
  root.addEventListener('touchmove', finish, { passive: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', layout);

  // wait for fonts so labels measure correctly
  (document.fonts?.ready ?? Promise.resolve()).then(() => { layout(); raf = requestAnimationFrame(frame); });
}
