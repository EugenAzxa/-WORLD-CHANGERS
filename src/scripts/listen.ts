// "Listen to this page" — reads the page aloud with the browser's own speech engine
// (Web Speech API), for visitors who find reading hard. No audio files, no services.
// Reads the page title, the lead and the main text; highlights and follows the part
// being read. Pause, stop and speed. The button appears only on pages with enough text.

const MIN_CHARS = 500;
const SPEEDS = [1, 1.25, 0.85];

type Chunk = { el: HTMLElement; text: string };

export function mountListen() {
  const bar = document.querySelector<HTMLElement>('[data-listen-bar]');
  if (!bar || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  const playBtn = bar.querySelector<HTMLButtonElement>('[data-listen-play]')!;
  const stopBtn = bar.querySelector<HTMLButtonElement>('[data-listen-stop]')!;
  const rateBtn = bar.querySelector<HTMLButtonElement>('[data-listen-rate]')!;
  const label = bar.querySelector<HTMLElement>('[data-listen-label]')!;
  const status = bar.querySelector<HTMLElement>('[data-listen-status]')!;

  // ---------- what to read
  const main = document.querySelector('main');
  if (!main) return;
  const roots = [...main.querySelectorAll<HTMLElement>('[data-listen], .prose')].filter((r) => !r.parentElement?.closest('[data-listen], .prose'));
  const sel = 'h2, h3, h4, p, li, blockquote, figcaption';
  const parts: HTMLElement[] = [];
  const title = main.querySelector<HTMLElement>('h1');
  if (title) parts.push(title);
  const lead = title?.parentElement?.querySelector<HTMLElement>('.lead');
  if (lead) parts.push(lead);
  for (const r of roots) {
    const found = [...r.querySelectorAll<HTMLElement>(sel)].filter((el) => !el.querySelector(sel) || el.matches('li, blockquote'));
    (found.length ? found : [r]).forEach((el) => { if (!parts.includes(el)) parts.push(el); });
  }
  const visible = (el: HTMLElement) => !el.closest('[aria-hidden="true"], nav, .crumbs, [hidden]') && el.offsetParent !== null;
  const chunks: Chunk[] = [];
  for (const el of parts.filter(visible)) {
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (text.length < 2) continue;
    // short pieces keep the speech engine responsive and avoid the long-utterance cut-off in Chrome
    const sentences = text.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g) || [text];
    let buf = '';
    for (const s of sentences) {
      if ((buf + s).length > 220 && buf) { chunks.push({ el, text: buf.trim() }); buf = ''; }
      buf += s;
    }
    if (buf.trim()) chunks.push({ el, text: buf.trim() });
  }
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  if (total < MIN_CHARS) return;
  bar.hidden = false;

  // ---------- voice
  let voice: SpeechSynthesisVoice | null = null;
  const pickVoice = () => {
    const vs = synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
    const pref = [/natural/i, /premium|enhanced/i, /google uk english female/i, /google us english/i, /samantha|daniel|serena|karen|moira/i];
    voice = pref.map((re) => vs.find((v) => re.test(v.name))).find(Boolean) || vs.find((v) => v.default) || vs[0] || null;
  };
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);

  // ---------- playback
  let i = 0, playing = false, rate = 0, current: HTMLElement | null = null;
  const minutes = Math.max(1, Math.round(total / 900));
  label.textContent = `Listen · ${minutes} min`;

  function mark(el: HTMLElement | null) {
    if (current === el) return;
    current?.classList.remove('is-reading');
    current = el;
    if (el) {
      el.classList.add('is-reading');
      const r = el.getBoundingClientRect();
      if (r.top < 90 || r.bottom > innerHeight - 90) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  function ui() {
    bar.classList.toggle('on', playing || i > 0);
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.setAttribute('aria-label', playing ? 'Pause reading' : i > 0 ? 'Resume reading' : 'Listen to this page');
    label.textContent = playing || i > 0 ? `${Math.min(i + 1, chunks.length)} / ${chunks.length}` : `Listen · ${minutes} min`;
  }
  function speak() {
    if (i >= chunks.length) { stop(); return; }
    const c = chunks[i];
    const u = new SpeechSynthesisUtterance(c.text);
    u.lang = voice?.lang || 'en-GB';
    if (voice) u.voice = voice;
    u.rate = SPEEDS[rate];
    u.onstart = () => { mark(c.el); ui(); };
    u.onend = () => { if (!playing) return; i++; speak(); };
    u.onerror = (e) => { if (e.error === 'interrupted' || e.error === 'canceled') return; i++; if (playing) speak(); };
    synth.speak(u);
  }
  function play() {
    playing = true;
    synth.cancel();
    speak();
    status.textContent = 'Reading the page aloud';
    ui();
  }
  function pause() {
    // cancel + remember position works on every engine (pause() is unreliable on Android)
    playing = false;
    synth.cancel();
    status.textContent = 'Paused';
    ui();
  }
  function stop() {
    playing = false;
    synth.cancel();
    i = 0;
    mark(null);
    status.textContent = 'Stopped';
    ui();
  }
  playBtn.addEventListener('click', () => (playing ? pause() : play()));
  stopBtn.addEventListener('click', stop);
  rateBtn.addEventListener('click', () => {
    rate = (rate + 1) % SPEEDS.length;
    rateBtn.textContent = `${SPEEDS[rate]}×`;
    rateBtn.setAttribute('aria-label', `Reading speed ${SPEEDS[rate]} times`);
    if (playing) { synth.cancel(); speak(); }
  });
  // start from a paragraph: click it while the reader is on
  main.addEventListener('dblclick', (e) => {
    if (!bar.classList.contains('on')) return;
    const k = chunks.findIndex((c) => c.el.contains(e.target as Node));
    if (k >= 0) { i = k; play(); }
  });
  addEventListener('pagehide', () => synth.cancel());
  ui();
}
