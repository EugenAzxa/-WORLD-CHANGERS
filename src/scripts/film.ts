// Welcome film = the opening of the site.
// - First visit in a browser session: autoplays muted; when it ends, holds the welcome
//   for a moment and scrolls down to the page by itself. "Skip intro" does it at once.
// - If the visitor scrolls or turns the sound on, they are in control: no auto-scroll
//   while they are looking elsewhere (sound on → it waits a little longer at the end).
// - Later visits in the same session, and reduced motion: no autoplay, the welcome frame
//   is shown with a play button. Force the opening again with /?film=1.

type Cue = { from: number; to: number; text: string; code?: string };

const SEEN = 'wcs-film';
const HOLD_MS = 1800;       // how long the final welcome stays before scrolling on
const HOLD_SOUND_MS = 2600;

export function mountFilm() {
  const root = document.querySelector<HTMLElement>('[data-film]');
  if (!root) return;
  const video = root.querySelector<HTMLVideoElement>('[data-film-video]')!;
  const cueEl = root.querySelector<HTMLElement>('[data-film-cue]')!;
  const cueText = cueEl.querySelector('span')!;
  const cueCode = cueEl.querySelector('i')!;
  const subEl = root.querySelector<HTMLElement>('[data-film-sub]')!;
  const soundBtn = root.querySelector<HTMLButtonElement>('[data-film-sound]')!;
  const soundLabel = root.querySelector<HTMLElement>('[data-film-sound-label]')!;
  const playBtn = root.querySelector<HTMLButtonElement>('[data-film-play]')!;
  const progress = root.querySelector<HTMLElement>('[data-film-progress]')!;
  const target = document.getElementById('hero');
  const { cues, subs } = JSON.parse(root.querySelector('[data-film-cues]')!.textContent!) as { cues: Cue[]; subs: Cue[] };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seen = false;
  try { seen = !!sessionStorage.getItem(SEEN) && !/[?&]film=1/.test(location.search); } catch {}
  const opening = !reduce && !seen; // plays as the opening sequence

  // pick the file for the screen; small screens and data-saver get 720p
  const conn = (navigator as any).connection;
  const small = window.innerWidth * Math.min(2, devicePixelRatio || 1) < 1500 || conn?.saveData;
  if (!opening) video.preload = 'none';
  video.src = (small ? video.dataset.srcSm : video.dataset.srcLg)!;

  const setState = (s: 'playing' | 'paused' | 'ended') => {
    root.dataset.state = s;
    playBtn.setAttribute('aria-label', s === 'playing' ? 'Pause film' : s === 'paused' ? 'Play film' : 'Replay film');
  };

  // ---------- captions, subtitle, progress
  let lastCue = '';
  function showCue(c: Cue, animate = true) {
    lastCue = c.text;
    if (!animate) { cueText.textContent = c.text; cueCode.textContent = c.code || ''; return; }
    cueEl.classList.add('swap');
    setTimeout(() => { cueText.textContent = c.text; cueCode.textContent = c.code || ''; cueEl.classList.remove('swap'); }, 180);
  }
  function tick() {
    const t = video.currentTime;
    const c = cues.find((q) => t >= q.from && t < q.to);
    if (c && c.text !== lastCue) showCue(c);
    const s = subs.find((q) => t >= q.from && t < q.to);
    if (s) { if (subEl.textContent !== s.text) subEl.textContent = s.text; subEl.classList.add('on'); }
    else subEl.classList.remove('on');
  }
  let raf = 0;
  const loop = () => {
    if (video.duration) progress.style.transform = `scaleX(${video.currentTime / video.duration})`;
    raf = requestAnimationFrame(loop);
  };
  video.addEventListener('timeupdate', tick);
  video.addEventListener('play', () => { setState('playing'); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); });
  video.addEventListener('pause', () => { cancelAnimationFrame(raf); if (!video.ended) setState('paused'); });

  // ---------- leaving the opening
  let userTookOver = false; // scrolled with wheel / touch / keys during the film
  let leaveTimer = 0;
  function markSeen() { try { sessionStorage.setItem(SEEN, '1'); } catch {} }
  function goToPage() {
    clearTimeout(leaveTimer);
    markSeen();
    root.dataset.seen = '';
    if (!target) return;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 68;
    const top = target.getBoundingClientRect().top + window.scrollY - header + 1;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  }
  video.addEventListener('ended', () => {
    setState('ended');
    tick();
    progress.style.transform = 'scaleX(1)';
    markSeen();
    // scroll on only if the visitor is still looking at the film
    const r = root.getBoundingClientRect();
    const stillHere = r.top > -r.height * 0.4;
    if (opening && stillHere && !userTookOver) leaveTimer = window.setTimeout(goToPage, video.muted ? HOLD_MS : HOLD_SOUND_MS);
  });
  root.querySelectorAll<HTMLAnchorElement>('[data-film-skip]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (!video.ended) video.pause();
    goToPage();
  }));
  const takeOver = () => { userTookOver = true; clearTimeout(leaveTimer); };
  window.addEventListener('wheel', takeOver, { passive: true });
  window.addEventListener('touchmove', takeOver, { passive: true });
  window.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(e.key)) takeOver(); });

  // ---------- controls
  function setSound(on: boolean) {
    video.muted = !on;
    soundBtn.setAttribute('aria-pressed', String(on));
    soundLabel.textContent = on ? 'Sound off' : 'Sound on';
  }
  soundBtn.addEventListener('click', () => {
    const on = video.muted;
    setSound(on);
    // turning the voice on replays the film from the top so the greeting is heard in context
    if (on) { clearTimeout(leaveTimer); userTookOver = false; video.currentTime = 0; video.play().catch(() => {}); }
  });
  playBtn.addEventListener('click', () => {
    clearTimeout(leaveTimer);
    // pressing play is a user gesture, so the film can play with its voice
    if (video.paused || video.ended) setSound(true);
    if (video.ended) { video.currentTime = 0; video.play().catch(() => {}); }
    else if (video.paused) video.play().catch(() => {});
    else video.pause();
  });

  // Browsers block sound until the visitor interacts with the page. The film tries to start
  // with sound; if it has to start muted, the first click, tap or key press anywhere turns
  // the voice on (rewinding to the founder if the greeting has already begun).
  const GREETING = 7.6;
  let soundArmed = false;
  function armSound() {
    if (soundArmed) return;
    soundArmed = true;
    root.classList.add('needs-sound');
    soundLabel.textContent = 'Tap for sound';
    const unmute = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-film-skip], [data-film-sound], [data-film-play]')) return; // those buttons decide for themselves
      off();
      if (!video.muted || video.ended || video.paused) return;
      setSound(true);
      if (video.currentTime > GREETING + 0.7) video.currentTime = GREETING;
      // if the browser did not count this as a gesture it pauses the unmuted video: go back to muted and wait
      requestAnimationFrame(() => {
        if (video.paused && !video.ended) { setSound(false); video.play().catch(() => {}); soundArmed = false; armSound(); }
      });
    };
    const off = () => {
      root.classList.remove('needs-sound');
      ['click', 'keydown', 'touchend'].forEach((ev) => window.removeEventListener(ev, unmute, true));
    };
    // only events that browsers count as a user gesture (a scroll is not one)
    ['click', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unmute, true));
    soundBtn.addEventListener('click', off, { once: true });
  }

  // pause when scrolled away, resume when back (only if it was playing)
  let autoPaused = false;
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting && !video.paused) { video.pause(); autoPaused = true; }
    else if (e.isIntersecting && autoPaused) { autoPaused = false; video.play().catch(() => {}); }
  }, { threshold: 0.25 }).observe(root);

  if (!opening) {
    // already seen this session, or reduced motion: show the welcome frame, visitor presses play
    video.poster = video.dataset.endPoster!;
    root.dataset.seen = '';
    showCue(cues[cues.length - 1], false);
    progress.style.transform = 'scaleX(1)';
    setState('paused');
    return;
  }
  setState('playing');
  // try with sound first (allowed for returning visitors on some browsers), else muted
  setSound(true);
  video.play().catch(() => {
    setSound(false);
    armSound();
    video.play().catch(() => setState('paused'));
  });
}
