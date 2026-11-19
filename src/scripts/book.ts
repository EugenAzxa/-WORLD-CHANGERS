// Page-turning reader for /catalogue/.
// Desktop: two-page spreads (cover alone on the right), a 3D sheet turns between them.
// Narrow screens: one page at a time. Deep link: #p=<page>.

const src = (n: number) => `/catalogue/pages/p${String(n).padStart(2, '0')}.webp`;

export function mountBook() {
  const shell = document.querySelector<HTMLElement>('[data-book]');
  if (!shell) return;
  const N = Number(shell.dataset.total);
  const view = shell.querySelector<HTMLElement>('[data-book-view]')!;
  const slotL = view.querySelector<HTMLElement>('[data-slot="l"]')!;
  const slotR = view.querySelector<HTMLElement>('[data-slot="r"]')!;
  const label = shell.querySelector<HTMLElement>('[data-book-label]')!;
  const range = shell.querySelector<HTMLInputElement>('[data-book-range]')!;
  const prevBtn = shell.querySelector<HTMLButtonElement>('[data-book-prev]')!;
  const nextBtn = shell.querySelector<HTMLButtonElement>('[data-book-next]')!;
  const gridBtn = shell.querySelector<HTMLButtonElement>('[data-book-grid]')!;
  const grid = shell.querySelector<HTMLElement>('[data-book-gridview]')!;
  const fsBtn = shell.querySelector<HTMLButtonElement>('[data-book-fs]')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 800px)');

  let single = narrow.matches;
  let page = 1; // first visible page (spread mode: page of the left side, or 1 for the cover)
  let busy: null | (() => void) = null;

  // ----- geometry
  const spreadOf = (p: number) => (p <= 1 ? 0 : Math.floor(p / 2));
  const pagesOf = (s: number): [number | null, number | null] => (s === 0 ? [null, 1] : [2 * s, 2 * s + 1 <= N ? 2 * s + 1 : null]);
  const lastSpread = spreadOf(N);
  const normalize = (p: number) => {
    p = Math.min(N, Math.max(1, Math.round(p) || 1));
    if (single) return p;
    const [l, r] = pagesOf(spreadOf(p));
    return (l ?? r)!;
  };

  // ----- images
  const cache = new Map<number, HTMLImageElement>();
  function preload(n: number | null) {
    if (!n || n < 1 || n > N || cache.has(n)) return;
    const im = new Image();
    im.decoding = 'async';
    im.src = src(n);
    cache.set(n, im);
  }
  function img(n: number) {
    const el = document.createElement('img');
    el.src = src(n);
    el.alt = `Catalogue page ${n}`;
    el.decoding = 'async';
    el.draggable = false;
    return el;
  }
  function fill(slot: HTMLElement, n: number | null) {
    slot.replaceChildren(...(n ? [img(n)] : []));
    slot.classList.toggle('empty', !n);
  }

  // ----- render
  function visible(): number[] {
    if (single) return [page];
    return pagesOf(spreadOf(page)).filter(Boolean) as number[];
  }
  function updateUi() {
    const v = visible();
    label.textContent = v[0] === 1 ? 'Cover' : v.length > 1 ? `Pages ${v[0]}–${v[1]}` : `Page ${v[0]}`;
    range.value = String(v[0]);
    const atStart = single ? page <= 1 : spreadOf(page) === 0;
    const atEnd = single ? page >= N : spreadOf(page) >= lastSpread;
    prevBtn.disabled = atStart;
    nextBtn.disabled = atEnd;
    grid.querySelectorAll<HTMLElement>('[data-goto]').forEach((b) => b.classList.toggle('on', v.includes(Number(b.dataset.goto))));
    const h = `#p=${v[0]}`;
    if (location.hash !== h) history.replaceState(null, '', v[0] === 1 ? location.pathname + location.search : h);
    // warm the next and previous views
    const [a, b] = [Math.min(...v), Math.max(...v)];
    [a - 2, a - 1, b + 1, b + 2].forEach(preload);
  }
  function render() {
    view.classList.toggle('single', single);
    if (single) {
      fill(slotR, page);
    } else {
      const [l, r] = pagesOf(spreadOf(page));
      fill(slotL, l);
      fill(slotR, r);
    }
    updateUi();
  }

  // ----- turning
  function finishTurn() {
    if (busy) busy();
  }
  function turn(dir: 1 | -1) {
    finishTurn();
    if (single) {
      const to = page + dir;
      if (to < 1 || to > N) return;
      page = to;
      render();
      if (!reduce.matches) slotR.animate([{ opacity: 0.2, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
      return;
    }
    const s = spreadOf(page);
    const t = s + dir;
    if (t < 0 || t > lastSpread) return;
    const [cl, cr] = pagesOf(s);
    const [nl, nr] = pagesOf(t);
    page = (nl ?? nr)!;
    if (reduce.matches) { render(); return; }

    // the sheet that turns: forward = current right page → new left page; back = current left → new right
    const front = dir > 0 ? cr : cl;
    const back = dir > 0 ? nl : nr;
    const leaf = document.createElement('div');
    leaf.className = `leaf ${dir > 0 ? 'fwd' : 'back'}`;
    const fa = document.createElement('div'); fa.className = 'face a';
    const fb = document.createElement('div'); fb.className = 'face b';
    if (front) fa.append(img(front));
    if (back) fb.append(img(back));
    leaf.append(fa, fb);
    view.append(leaf);
    // uncover the destination page under the sheet right away
    if (dir > 0) fill(slotR, nr); else fill(slotL, nl);
    updateUi();

    let done = false;
    busy = () => {
      if (done) return;
      done = true;
      busy = null;
      leaf.remove();
      if (dir > 0) fill(slotL, nl); else fill(slotR, nr);
    };
    leaf.addEventListener('transitionend', (e) => { if (e.propertyName === 'transform') finishTurn(); });
    setTimeout(finishTurn, 900);
    requestAnimationFrame(() => requestAnimationFrame(() => leaf.classList.add('turning')));
  }
  function goto(p: number) {
    finishTurn();
    page = normalize(p);
    render();
  }

  // ----- inputs
  prevBtn.addEventListener('click', () => turn(-1));
  nextBtn.addEventListener('click', () => turn(1));
  range.addEventListener('input', () => goto(Number(range.value)));
  view.addEventListener('click', (e) => {
    const r = view.getBoundingClientRect();
    turn(e.clientX - r.left < r.width / 2 ? -1 : 1);
  });
  let sx = 0, sy = 0;
  view.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  view.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); turn(dx < 0 ? 1 : -1); }
  });

  let inView = false;
  new IntersectionObserver(([en]) => { inView = en.isIntersecting; }, { threshold: 0.3 }).observe(view);
  window.addEventListener('keydown', (e) => {
    if (!inView && !document.fullscreenElement) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); }
    else if (e.key === 'Home') { e.preventDefault(); goto(1); }
    else if (e.key === 'End') { e.preventDefault(); goto(N); }
  });

  gridBtn.addEventListener('click', () => {
    const open = grid.hidden;
    grid.hidden = !open;
    gridBtn.setAttribute('aria-expanded', String(open));
  });
  // thumbnails and contents links
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
    if (!a) return;
    e.preventDefault();
    goto(Number(a.dataset.goto));
    if (!shell.contains(a)) shell.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
  });

  if (document.fullscreenEnabled) {
    fsBtn.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : shell.requestFullscreen()));
  } else fsBtn.hidden = true;

  narrow.addEventListener('change', () => { single = narrow.matches; goto(page); });
  window.addEventListener('hashchange', () => { const m = location.hash.match(/p=(\d+)/); if (m) goto(Number(m[1])); });

  const m = location.hash.match(/p=(\d+)/);
  page = normalize(m ? Number(m[1]) : 1);
  render();
}
