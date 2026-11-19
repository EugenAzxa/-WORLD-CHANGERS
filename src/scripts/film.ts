// Welcome film on the home page: muted autoplay, timed place captions and subtitle,
// sound toggle (restarts with voice), pause/replay. Respects reduced motion.

type Cue = { from: number; to: number; text: string; code?: string };

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
  const { cues, subs } = JSON.parse(root.querySelector('[data-film-cues]')!.textContent!) as { cues: Cue[]; subs: Cue[] };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // pick the file for the screen; small screens and data-saver get 720p
  const conn = (navigator as any).connection;
  const small = window.innerWidth * Math.min(2, devicePixelRatio || 1) < 1500 || conn?.saveData;
  if (reduce) video.preload = 'none';
  video.src = (small ? video.dataset.srcSm : video.dataset.srcLg)!;

  const setState = (s: 'playing' | 'paused' | 'ended') => {
    root.dataset.state = s;
    playBtn.setAttribute('aria-label', s === 'playing' ? 'Pause film' : s === 'paused' ? 'Play film' : 'Replay film');
  };

  let lastCue = '';
  function tick() {
    const t = video.currentTime;
    const c = cues.find((q) => t >= q.from && t < q.to);
    if (c && c.text !== lastCue) {
      lastCue = c.text;
      cueEl.classList.add('swap');
      setTimeout(() => { cueText.textContent = c.text; cueCode.textContent = c.code || ''; cueEl.classList.remove('swap'); }, 180);
    }
    const s = subs.find((q) => t >= q.from && t < q.to);
    if (s) { if (subEl.textContent !== s.text) subEl.textContent = s.text; subEl.classList.add('on'); }
    else subEl.classList.remove('on');
  }
  video.addEventListener('timeupdate', tick);
  video.addEventListener('play', () => setState('playing'));
  video.addEventListener('pause', () => { if (!video.ended) setState('paused'); });
  video.addEventListener('ended', () => { setState('ended'); tick(); });

  function setSound(on: boolean) {
    video.muted = !on;
    soundBtn.setAttribute('aria-pressed', String(on));
    soundLabel.textContent = on ? 'Sound off' : 'Sound on';
  }
  soundBtn.addEventListener('click', () => {
    const on = video.muted;
    setSound(on);
    // turning the voice on replays the film from the top so the greeting is heard in context
    if (on) { video.currentTime = 0; video.play().catch(() => {}); }
  });
  playBtn.addEventListener('click', () => {
    if (video.ended) { video.currentTime = 0; video.play().catch(() => {}); }
    else if (video.paused) video.play().catch(() => {});
    else video.pause();
  });

  // pause when scrolled away, resume when back (only if it was playing)
  let autoPaused = false;
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting && !video.paused) { video.pause(); autoPaused = true; }
    else if (e.isIntersecting && autoPaused) { autoPaused = false; video.play().catch(() => {}); }
  }, { threshold: 0.25 }).observe(root);

  if (reduce) {
    // no autoplay: show the final frame (the welcome) and let the visitor start it
    video.poster = video.dataset.endPoster!;
    const end = cues[cues.length - 1];
    lastCue = end.text;
    cueText.textContent = end.text;
    cueCode.textContent = end.code || '';
    setState('paused');
    return;
  }
  setState('playing');
  video.play().catch(() => setState('paused'));
}
