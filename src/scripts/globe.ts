// Interactive "World Changers" globe.
// Canvas renderer on top of d3-geo's orthographic projection: dotted land,
// highlighted countries, lifted great-circle arcs from the Vatican hub,
// clickable pulsing markers, year filter and an animated chronological "journey".
import { geoOrthographic, geoPath, geoDistance, geoInterpolate, geoGraticule10 } from 'd3-geo';

type Place = { key: string; name: string; country: string; code: string; lat: number; lng: number; blurb: string; events: string[] };
type Ev = { slug: string; title: string; start: string; date: string; place: string; status: string; url: string; poster?: string; venue?: string; themes: string[] };
type Data = { dots: number[]; highlight: any; places: Place[]; events: Ev[]; hub: string };

const esc = (s: string) => (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mountGlobe(root: HTMLElement) {
  const data: Data = JSON.parse(root.querySelector('script[type="application/json"]')!.textContent!);
  const mode = root.dataset.mode || 'hero';
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const tooltip = root.querySelector<HTMLElement>('.globe-tooltip');
  const panel = root.querySelector<HTMLElement>('.globe-panel');
  const journeyCard = root.querySelector<HTMLElement>('.globe-journey');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(root);
  const tok = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
  const INK = tok('--globe-ink', '17, 17, 17');
  const ACCENT = tok('--globe-accent', '31, 90, 61');
  const SPHERE = tok('--globe-sphere', '#f8f6f1');
  const SPHERE_EDGE = tok('--globe-sphere-edge', '#e9e3d8');
  const PAPER = tok('--color-bg', '#f5f2ec');

  const evBySlug = Object.fromEntries(data.events.map((e) => [e.slug, e]));
  const placeByKey = Object.fromEntries(data.places.map((p) => [p.key, p]));
  const hub = placeByKey[data.hub];

  // ------------------------------------------------------------- state
  let W = 0, H = 0, DPR = 1, R = 0;
  let rot: [number, number] = [-hub.lng + 25, -hub.lat + 12];
  let zoom = 1;
  let year: string | null = null;
  let selected: Place | null = null;
  let hovered: Place | null = null;
  let dragging = false, moved = 0, lastX = 0, lastY = 0, vx = 0, vy = 0;
  let idleSince = performance.now();
  let tween: { from: [number, number]; to: [number, number]; z0: number; z1: number; t0: number; dur: number } | null = null;
  let journey: { i: number; list: Ev[]; timer: number; trail: Place[] } | null = null;
  let visible = true;
  let t = 0;

  const projection = geoOrthographic().clipAngle(90).precision(0.6);
  const path = geoPath(projection, ctx);
  const graticule = geoGraticule10();

  // land dots → unit vectors for fast visibility tests
  const N = data.dots.length / 2;
  const dotLL = new Float32Array(data.dots);

  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  const activePlaces = () => data.places.filter((p) => !year || p.events.some((s) => evBySlug[s]?.start?.startsWith(year!)));
  const placeEvents = (p: Place) => p.events.map((s) => evBySlug[s]).filter((e) => e && (!year || e.start?.startsWith(year)));

  // center of view in geographic coords
  const center = (): [number, number] => [-rot[0], -rot[1]];
  function screen(lng: number, lat: number, alt = 0) {
    const p = projection([lng, lat])!;
    const depth = Math.cos(geoDistance([lng, lat], center()));
    const x = W / 2 + (p[0] - W / 2) * (1 + alt);
    const y = H / 2 + (p[1] - H / 2) * (1 + alt);
    const out = Math.hypot(x - W / 2, y - H / 2) > R;
    return { x, y, depth, vis: depth > 0 || out };
  }

  // ------------------------------------------------------------- drawing
  function drawArc(a: Place, b: Place, alpha: number, dash: boolean, width = 1.2) {
    const interp = geoInterpolate([a.lng, a.lat], [b.lng, b.lat]);
    const dist = geoDistance([a.lng, a.lat], [b.lng, b.lat]);
    const h = Math.min(0.32, 0.06 + dist * 0.18);
    const STEPS = Math.max(16, Math.round(dist * 40));
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= STEPS; i++) {
      const f = i / STEPS;
      const [lng, lat] = interp(f);
      const s = screen(lng, lat, Math.sin(Math.PI * f) * h);
      if (!s.vis) { pen = false; continue; }
      if (!pen) { ctx.moveTo(s.x, s.y); pen = true; } else ctx.lineTo(s.x, s.y);
    }
    ctx.strokeStyle = `rgba(${ACCENT},${alpha})`;
    ctx.lineWidth = width;
    if (dash && !reduced) { ctx.setLineDash([2, 5]); ctx.lineDashOffset = -t * 0.025; } else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    const baseR = Math.min(W, H) / 2 * (mode === 'hero' ? 0.88 : 0.84);
    R = baseR * zoom;
    projection.translate([W / 2, H / 2]).scale(R).rotate([rot[0], rot[1], 0]);
    ctx.clearRect(0, 0, W, H);

    // paper sphere with a soft terminator (no glow)
    const sph = ctx.createRadialGradient(W / 2 - R * 0.3, H / 2 - R * 0.35, R * 0.2, W / 2, H / 2, R);
    sph.addColorStop(0, SPHERE);
    sph.addColorStop(1, SPHERE_EDGE);
    ctx.fillStyle = sph;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(${INK},0.9)`; ctx.lineWidth = 1; ctx.stroke();

    // graticule
    ctx.beginPath(); path(graticule); ctx.strokeStyle = `rgba(${INK},0.07)`; ctx.lineWidth = 0.6; ctx.stroke();

    // highlighted countries (under the dots)
    ctx.beginPath(); path(data.highlight);
    ctx.fillStyle = `rgba(${ACCENT},0.16)`; ctx.fill();
    ctx.strokeStyle = `rgba(${ACCENT},0.75)`; ctx.lineWidth = 0.9; ctx.stroke();

    // land dots (ink)
    const c = center();
    const dotR = Math.max(0.9, R / 300);
    ctx.fillStyle = `rgb(${INK})`;
    for (let i = 0; i < N; i++) {
      const lng = dotLL[i * 2], lat = dotLL[i * 2 + 1];
      const d = Math.cos(geoDistance([lng, lat], c));
      if (d <= 0.02) continue;
      const p = projection([lng, lat])!;
      ctx.globalAlpha = 0.12 + d * 0.5;
      ctx.beginPath(); ctx.arc(p[0], p[1], dotR * (0.6 + d * 0.4), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const act = activePlaces();
    for (const p of act) if (p !== hub) drawArc(hub, p, journey ? 0.15 : selected && selected !== p ? 0.18 : 0.55, !journey);
    if (journey) for (let i = 1; i < journey.trail.length; i++) drawArc(journey.trail[i - 1], journey.trail[i], 0.95, true, 1.6);

    // markers
    const labels: { p: Place; x: number; y: number; base: number; fade: number; prio: number }[] = [];
    for (const p of act) {
      const s = screen(p.lng, p.lat);
      if (s.depth <= 0) continue;
      const n = placeEvents(p).length;
      const base = (2.6 + Math.sqrt(n) * 1.9) * Math.min(1.5, Math.max(0.85, R / 300));
      const isSel = selected === p, isHov = hovered === p;
      const pulse = reduced ? 0 : (t * 0.0009 + p.lat) % 1;
      const fade = Math.min(1, s.depth * 2.2);
      ctx.globalAlpha = fade;
      // thin pulse ring
      ctx.beginPath(); ctx.arc(s.x, s.y, base + pulse * base * 2.4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ACCENT},${(1 - pulse) * 0.6})`; ctx.lineWidth = 1; ctx.stroke();
      // core: accent disc with paper ring
      ctx.beginPath(); ctx.arc(s.x, s.y, isSel || isHov ? base * 1.25 : base, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? `rgb(${INK})` : `rgb(${ACCENT})`; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = SPHERE; ctx.stroke();
      if (isSel) { ctx.beginPath(); ctx.arc(s.x, s.y, base * 2.2, 0, Math.PI * 2); ctx.strokeStyle = `rgb(${INK})`; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.globalAlpha = 1;
      const showLabel = isSel || isHov || (mode === 'full' && s.depth > 0.35) || (mode === 'hero' && (p === hub || n > 1) && !selected && s.depth > 0.3);
      if (showLabel) labels.push({ p, x: s.x, y: s.y, base, fade, prio: isSel ? 3 : isHov ? 2 : n / 100 });
    }

    // labels: ink tabs with mono country code; highest priority first, skip overlaps
    labels.sort((a, b) => b.prio - a.prio);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const l of labels) {
      const isSel = selected === l.p;
      ctx.font = `400 ${isSel ? 16 : 14}px Newsreader, Georgia, serif`;
      const tw = ctx.measureText(l.p.name).width;
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      const cw = ctx.measureText(l.p.code).width + 8;
      const w = tw + cw + 18, h = isSel ? 26 : 24;
      const spots = [
        [l.x + l.base + 8, l.y - h / 2],
        [l.x - l.base - 8 - w, l.y - h / 2],
        [l.x - w / 2, l.y - l.base - 8 - h],
        [l.x - w / 2, l.y + l.base + 8],
      ];
      let spot: number[] | null = null;
      for (const [lx, ly] of spots) {
        const r = { x: lx, y: ly, w, h };
        if (r.x < 4 || r.x + r.w > W - 4 || r.y < 4 || r.y + r.h > H - 4) continue;
        if (!placed.some((q) => r.x < q.x + q.w + 2 && r.x + r.w + 2 > q.x && r.y < q.y + q.h + 2 && r.y + r.h + 2 > q.y)) { spot = [lx, ly]; placed.push(r); break; }
      }
      if (!spot) continue;
      ctx.globalAlpha = l.fade;
      ctx.fillStyle = isSel ? `rgb(${ACCENT})` : `rgb(${INK})`;
      ctx.fillRect(spot[0], spot[1], w, h);
      ctx.fillStyle = PAPER;
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.fillText(l.p.code, spot[0] + 8, spot[1] + h / 2 + 3.5);
      ctx.fillRect(spot[0] + cw + 4, spot[1] + 6, 1, h - 12);
      ctx.font = `400 ${isSel ? 16 : 14}px Newsreader, Georgia, serif`;
      ctx.fillText(l.p.name, spot[0] + cw + 11, spot[1] + h / 2 + 4.5);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------- loop
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(64, now - last); last = now; t += dt;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.dur), e = ease(k);
      // shortest longitude path
      let dl = tween.to[0] - tween.from[0]; dl = ((dl + 540) % 360) - 180;
      rot = [tween.from[0] + dl * e, tween.from[1] + (tween.to[1] - tween.from[1]) * e];
      zoom = tween.z0 + (tween.z1 - tween.z0) * e;
      if (k >= 1) tween = null;
    } else if (!dragging) {
      if (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01) {
        rot = [rot[0] + vx, clampLat(rot[1] - vy)]; vx *= 0.93; vy *= 0.93;
      } else if (!reduced && !selected && !journey && now - idleSince > 2500) {
        rot = [rot[0] + dt * 0.006, rot[1] + (-hub.lat * 0.55 - rot[1]) * 0.004];
      }
    }
    if (visible) draw();
    requestAnimationFrame(frame);
  }
  const clampLat = (v: number) => Math.max(-70, Math.min(70, v));

  function flyTo(p: Place, z?: number) {
    tween = { from: [rot[0], rot[1]], to: [-p.lng, clampLat(-p.lat + 8)], z0: zoom, z1: z ?? Math.max(zoom, mode === 'full' ? 1.6 : 1.25), t0: performance.now(), dur: 1300 };
  }

  // ------------------------------------------------------------- hit test
  function pick(mx: number, my: number): Place | null {
    let best: Place | null = null, bd = 18;
    for (const p of activePlaces()) {
      const s = screen(p.lng, p.lat);
      if (s.depth <= 0) continue;
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ------------------------------------------------------------- pointer
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; vx = vy = 0; tween = null;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      const k = 0.28 / zoom;
      vx = dx * k; vy = dy * k;
      rot = [rot[0] + vx, clampLat(rot[1] - vy)];
      lastX = e.clientX; lastY = e.clientY; idleSince = performance.now();
      return;
    }
    const p = pick(e.clientX - r.left, e.clientY - r.top);
    hovered = p;
    canvas.style.cursor = p ? 'pointer' : 'grab';
    if (tooltip) {
      if (p) {
        const n = placeEvents(p).length;
        tooltip.innerHTML = `<b>${esc(p.name)}</b><span>${p.code} · ${esc(p.country)} · ${n} event${n === 1 ? '' : 's'}</span>`;
        tooltip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
        tooltip.classList.add('on');
      } else tooltip.classList.remove('on');
    }
  });
  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false; idleSince = performance.now();
    if (moved < 6) {
      const r = canvas.getBoundingClientRect();
      const p = pick(e.clientX - r.left, e.clientY - r.top);
      if (p) { stopJourney(); select(p); }
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { hovered = null; tooltip?.classList.remove('on'); });
  if (mode === 'full') canvas.addEventListener('wheel', (e) => { e.preventDefault(); tween = null; zoom = Math.max(0.7, Math.min(4, zoom * (e.deltaY > 0 ? 0.92 : 1.08))); }, { passive: false });

  root.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    const z = Math.max(0.7, Math.min(4, zoom * (b.dataset.zoom === 'in' ? 1.35 : 0.74)));
    tween = { from: [rot[0], rot[1]], to: [rot[0], rot[1]], z0: zoom, z1: z, t0: performance.now(), dur: 350 };
  }));
  root.querySelector('[data-reset]')?.addEventListener('click', () => { stopJourney(); select(null); tween = { from: [rot[0], rot[1]], to: [-hub.lng + 25, -hub.lat + 12], z0: zoom, z1: 1, t0: performance.now(), dur: 1000 }; });

  // ------------------------------------------------------------- year filter
  root.querySelectorAll<HTMLButtonElement>('[data-year]').forEach((b) => b.addEventListener('click', () => {
    year = b.dataset.year || null;
    root.querySelectorAll('[data-year]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (selected && !activePlaces().includes(selected)) selected = null;
    stopJourney();
    renderPanel();
  }));

  // ------------------------------------------------------------- panel
  function select(p: Place | null) {
    selected = p;
    if (p) flyTo(p);
    renderPanel();
    root.dispatchEvent(new CustomEvent('globe:select', { detail: p?.key || null }));
  }

  function eventItem(e: Ev) {
    return `<a class="gp-event" href="${e.url}">
      ${e.poster ? `<img src="${e.poster}" alt="" loading="lazy" width="56" height="70">` : '<span class="gp-noimg"></span>'}
      <span><small>${esc(e.date)}${e.status === 'upcoming' ? ' · <em>Upcoming</em>' : ''}</small><b>${esc(e.title)}</b>${e.venue ? `<i>${esc(e.venue)}</i>` : ''}</span>
    </a>`;
  }

  function renderPanel() {
    if (!panel) return;
    const act = activePlaces();
    if (!selected) {
      const evCount = act.reduce((s, p) => s + placeEvents(p).length, 0);
      const ctry = new Set(act.map((p) => p.country)).size;
      panel.innerHTML = `
        <p class="gp-eyebrow">${year ? `Year ${year}` : '2023 — today'}</p>
        <h3 class="gp-title">${evCount} gatherings in ${ctry} countries</h3>
        <p class="gp-hint">Drag to turn the globe. Select a place to see what happened there, or play the whole journey in order.</p>
        <ul class="gp-places">${act.sort((a, b) => placeEvents(b).length - placeEvents(a).length).map((p) => `
          <li><button type="button" data-pick="${p.key}"><span class="gp-code">${p.code}</span><span><b>${esc(p.name)}</b><small>${esc(p.country)}</small></span><span class="gp-count">${placeEvents(p).length}</span></button></li>`).join('')}
        </ul>`;
    } else {
      const evs = placeEvents(selected).sort((a, b) => b.start.localeCompare(a.start));
      const idx = act.indexOf(selected);
      panel.innerHTML = `
        <div class="gp-nav">
          <button type="button" data-back>← All places</button>
          <span><button type="button" data-step="-1" aria-label="Previous place">‹</button><button type="button" data-step="1" aria-label="Next place">›</button></span>
        </div>
        <p class="gp-eyebrow">${selected.code} — ${esc(selected.country)}</p>
        <h3 class="gp-title">${esc(selected.name)}</h3>
        <p class="gp-blurb">${esc(selected.blurb)}</p>
        <div class="gp-events">${evs.map(eventItem).join('')}</div>`;
      panel.querySelector('[data-back]')!.addEventListener('click', () => select(null));
      panel.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => {
        const n = act.length; select(act[(idx + Number(b.dataset.step) + n) % n]);
      }));
    }
    panel.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => b.addEventListener('click', () => select(placeByKey[b.dataset.pick!])));
  }

  // ------------------------------------------------------------- journey
  const playBtn = root.querySelector<HTMLButtonElement>('[data-play]');
  function stopJourney() {
    if (!journey) return;
    clearTimeout(journey.timer); journey = null;
    journeyCard?.classList.remove('on');
    playBtn?.setAttribute('aria-pressed', 'false');
    if (playBtn) { playBtn.querySelector('span')!.textContent = 'Play the journey'; playBtn.querySelector('path')!.setAttribute('d', 'M3 1.5v11l9-5.5z'); }
  }
  function step() {
    if (!journey) return;
    const e = journey.list[journey.i];
    const p = placeByKey[e.place];
    if (journey.trail.at(-1) !== p) journey.trail.push(p);
    selected = p; flyTo(p, mode === 'full' ? 1.5 : 1.15); renderPanel();
    if (journeyCard) {
      journeyCard.innerHTML = `
        <div class="gj-progress"><i style="width:${((journey.i + 1) / journey.list.length) * 100}%"></i></div>
        <a href="${e.url}" class="gj-body">
          ${e.poster ? `<img src="${e.poster}" alt="">` : ''}
          <span><small>${journey.i + 1} / ${journey.list.length} · ${esc(e.date)}</small><b>${esc(e.title)}</b><i>${p.code} — ${esc(e.venue || p.name)}</i></span>
        </a>`;
      journeyCard.classList.add('on');
    }
    journey.i++;
    if (journey.i >= journey.list.length) { journey.timer = window.setTimeout(stopJourney, 4200); return; }
    journey.timer = window.setTimeout(step, 3400);
  }
  playBtn?.addEventListener('click', () => {
    if (journey) { stopJourney(); return; }
    const list = data.events.filter((e) => !year || e.start?.startsWith(year));
    journey = { i: 0, list, timer: 0, trail: [] };
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.querySelector('span')!.textContent = 'Stop';
    playBtn.querySelector('path')!.setAttribute('d', 'M3 3h8v8H3z');
    step();
  });

  // ------------------------------------------------------------- lifecycle
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { stopJourney(); if (selected) select(null); } });
  resize();
  renderPanel();
  requestAnimationFrame(frame);

  // deep link: /world-map/#place=dubai
  const m = location.hash.match(/place=([\w-]+)/);
  if (m && placeByKey[m[1]]) setTimeout(() => select(placeByKey[m[1]]), 300);
}

document.querySelectorAll<HTMLElement>('[data-globe]').forEach(mountGlobe);
