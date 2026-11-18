// Site-wide behaviour: header, menus, search, scroll reveal, lightbox, countdowns, filters.

// ---------- header ----------
const header = document.querySelector<HTMLElement>('[data-header]');
const onScroll = () => header?.classList.toggle('scrolled', window.scrollY > 20);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

document.querySelectorAll<HTMLButtonElement>('[data-dd]').forEach((btn) => {
  const dd = document.getElementById(btn.getAttribute('aria-controls')!);
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    document.querySelectorAll('[data-dd]').forEach((b) => { b.setAttribute('aria-expanded', 'false'); document.getElementById(b.getAttribute('aria-controls')!)?.classList.remove('open'); });
    btn.setAttribute('aria-expanded', String(open));
    dd?.classList.toggle('open', open);
  });
});
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.nav')) document.querySelectorAll('[data-dd]').forEach((b) => { b.setAttribute('aria-expanded', 'false'); document.getElementById(b.getAttribute('aria-controls')!)?.classList.remove('open'); });
});

// ---------- mobile menu ----------
const menu = document.querySelector<HTMLElement>('[data-menu]');
const setMenu = (open: boolean) => { menu?.classList.toggle('open', open); menu?.setAttribute('aria-hidden', String(!open)); document.body.style.overflow = open ? 'hidden' : ''; };
document.querySelector('[data-menu-open]')?.addEventListener('click', () => setMenu(true));
document.querySelector('[data-menu-close]')?.addEventListener('click', () => setMenu(false));

// ---------- reveal ----------
const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// ---------- animated counters ----------
const cio = new IntersectionObserver((entries) => entries.forEach((en) => {
  if (!en.isIntersecting) return;
  const el = en.target as HTMLElement; cio.unobserve(el);
  const to = Number(el.dataset.count); const suffix = el.dataset.suffix || '';
  const t0 = performance.now(); const dur = 1400;
  const tick = (now: number) => { const k = Math.min(1, (now - t0) / dur); const v = Math.round(to * (1 - Math.pow(1 - k, 3))); el.textContent = v.toLocaleString('en') + suffix; if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
document.querySelectorAll('[data-count]').forEach((el) => cio.observe(el));

// ---------- countdown ----------
document.querySelectorAll<HTMLElement>('[data-countdown]').forEach((el) => {
  const target = new Date(el.dataset.countdown! + 'T09:00:00+01:00').getTime();
  const parts = ['d', 'h', 'm', 's'].map((k) => el.querySelector<HTMLElement>(`[data-cd="${k}"]`));
  const tick = () => {
    let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    const vals = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
    parts.forEach((p, i) => { if (p) p.textContent = String(vals[i]).padStart(i ? 2 : 1, '0'); });
  };
  tick(); setInterval(tick, 1000);
});

// ---------- lightbox ----------
const lb = document.querySelector<HTMLElement>('[data-lightbox-modal]');
const lbImg = lb?.querySelector<HTMLImageElement>('[data-lb-img]');
const lbCount = lb?.querySelector<HTMLElement>('[data-lb-count]');
let lbList: HTMLAnchorElement[] = [];
let lbIdx = 0;
const lbShow = (i: number) => {
  if (!lbImg) return;
  lbIdx = (i + lbList.length) % lbList.length;
  lbImg.src = lbList[lbIdx].href;
  lbImg.alt = lbList[lbIdx].querySelector('img')?.alt || '';
  if (lbCount) lbCount.textContent = `${lbIdx + 1} / ${lbList.length}`;
  const next = lbList[(lbIdx + 1) % lbList.length]; if (next) { const p = new Image(); p.src = next.href; }
};
const lbClose = () => { lb?.classList.remove('open'); document.body.style.overflow = ''; };
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-lb]');
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  lbList = [...document.querySelectorAll<HTMLAnchorElement>(`a[data-lb="${a.dataset.lb}"]`)];
  lb?.classList.add('open'); document.body.style.overflow = 'hidden';
  lbShow(lbList.indexOf(a));
});
lb?.querySelector('[data-lb-close]')?.addEventListener('click', lbClose);
lb?.querySelector('[data-lb-prev]')?.addEventListener('click', () => lbShow(lbIdx - 1));
lb?.querySelector('[data-lb-next]')?.addEventListener('click', () => lbShow(lbIdx + 1));
lb?.addEventListener('click', (e) => { if (e.target === lb) lbClose(); });
let touchX = 0;
lb?.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lb?.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 50) lbShow(lbIdx + (dx < 0 ? 1 : -1)); });

// ---------- search ----------
type Hit = { t: string; u: string; k: string; d?: string; i?: string; s: string };
const modal = document.querySelector<HTMLElement>('[data-search]');
const input = modal?.querySelector<HTMLInputElement>('[data-search-input]');
const results = modal?.querySelector<HTMLElement>('[data-search-results]');
let index: Hit[] | null = null;
let sel = 0;
const escH = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
async function openSearch() {
  modal?.classList.add('open'); document.body.style.overflow = 'hidden';
  input?.focus(); input?.select();
  if (!index) { index = await fetch('/search.json').then((r) => r.json()); runSearch(); }
}
const closeSearch = () => { modal?.classList.remove('open'); document.body.style.overflow = ''; };
function runSearch() {
  if (!results || !index) return;
  const q = norm(input?.value.trim() || '');
  const terms = q.split(/\s+/).filter(Boolean);
  let hits: Hit[];
  if (!terms.length) hits = index.filter((h) => h.k === 'Event').slice(0, 8);
  else hits = index
    .map((h) => { const hay = h.s; let score = 0; for (const t of terms) { const i = hay.indexOf(t); if (i < 0) return null; score += i === 0 ? 3 : hay.includes(' ' + t) ? 2 : 1; } if (norm(h.t).startsWith(terms[0])) score += 3; return { h, score }; })
    .filter(Boolean).sort((a: any, b: any) => b.score - a.score).slice(0, 30).map((x: any) => x.h);
  sel = 0;
  results.innerHTML = hits.length ? hits.map((h, i) => `<a href="${h.u}" class="${i === 0 ? 'sel' : ''}">${h.i ? `<img src="${h.i}" alt="" loading="lazy">` : '<span class="ph"></span>'}<span><b>${escH(h.t)}</b>${h.d ? `<small>${escH(h.d)}</small>` : ''}</span><span class="kind">${h.k}</span></a>`).join('') : '<p class="empty">Nothing found.</p>';
}
input?.addEventListener('input', runSearch);
input?.addEventListener('keydown', (e) => {
  const links = [...(results?.querySelectorAll('a') || [])];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(links.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); links.forEach((l, i) => l.classList.toggle('sel', i === sel)); links[sel]?.scrollIntoView({ block: 'nearest' }); }
  if (e.key === 'Enter' && links[sel]) { e.preventDefault(); location.href = (links[sel] as HTMLAnchorElement).href; }
});
modal?.addEventListener('click', (e) => { if (e.target === modal) closeSearch(); });
document.querySelectorAll('[data-search-open]').forEach((b) => b.addEventListener('click', openSearch));

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea')) { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') { closeSearch(); lbClose(); setMenu(false); }
  if (lb?.classList.contains('open')) { if (e.key === 'ArrowRight') lbShow(lbIdx + 1); if (e.key === 'ArrowLeft') lbShow(lbIdx - 1); }
});

// ---------- client-side filtering ([data-filter-root]) ----------
document.querySelectorAll<HTMLElement>('[data-filter-root]').forEach((root) => {
  const items = [...root.querySelectorAll<HTMLElement>('[data-item]')];
  const q = root.querySelector<HTMLInputElement>('[data-filter-q]');
  const count = root.querySelector<HTMLElement>('[data-filter-count]');
  const empty = root.querySelector<HTMLElement>('[data-filter-empty]');
  const state: Record<string, string> = {};
  const apply = () => {
    const term = norm(q?.value.trim() || '');
    let n = 0;
    for (const it of items) {
      let ok = !term || norm(it.dataset.search || it.textContent || '').includes(term);
      for (const [k, v] of Object.entries(state)) if (v && !(it.dataset[k] || '').split(' ').includes(v)) ok = false;
      it.hidden = !ok; if (ok) n++;
    }
    if (count) count.textContent = String(n);
    if (empty) empty.hidden = n > 0;
    root.querySelectorAll<HTMLElement>('[data-group-for]').forEach((g) => { g.hidden = !g.querySelector('[data-item]:not([hidden])'); });
  };
  root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    const [k, v] = b.dataset.filter!.split(':');
    state[k] = v;
    root.querySelectorAll<HTMLButtonElement>(`[data-filter^="${k}:"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  }));
  q?.addEventListener('input', apply);
  // initial filter from URL (?theme=quantum)
  const params = new URLSearchParams(location.search);
  params.forEach((v, k) => root.querySelector<HTMLButtonElement>(`[data-filter="${k}:${v}"]`)?.click());
});
