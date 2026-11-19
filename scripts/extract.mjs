// Content extractor: converts the crawled wcsiasc.org (WordPress + Elementor)
// into clean JSON used by the Astro site.
//
// Usage: node scripts/extract.mjs <crawl-dir>
//   <crawl-dir> must contain the REST dumps (pages_1.json, posts_1.json, team_*.json,
//   awards_1.json, team_cat.json, categories.json) and html/ with rendered pages.
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const CRAWL = process.argv[2];
if (!CRAWL) throw new Error('usage: node scripts/extract.mjs <crawl-dir>');
const OUT = path.resolve('src/data');
fs.mkdirSync(OUT, { recursive: true });

const ORIGIN = 'https://wcsiasc.org';
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(CRAWL, f), 'utf8'));
const listJSON = (prefix) =>
  fs.readdirSync(CRAWL)
    .filter((f) => new RegExp(`^${prefix}_\\d+\\.json$`).test(f))
    .flatMap((f) => { const d = readJSON(f); return Array.isArray(d) ? d : []; });
const htmlFile = (url) => {
  const n = url.replace(ORIGIN, '').replace(/\//g, '_') || '_';
  const p = path.join(CRAWL, 'html', n + '.html');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

// ---------- helpers ----------
const images = new Set(); // every image URL we reference -> downloaded later
const videos = new Set();
const decode = (s) => cheerio.load(`<i>${s ?? ''}</i>`)('i').text();
const clean = (s) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

function absUrl(u) {
  if (!u) return null;
  u = u.trim();
  if (u.startsWith('//')) u = 'https:' + u;
  u = u.replace(/^https?:\/\/(events|network|awards)\//, '/$1/'); // malformed "http://events/..." links on the old site
  if (u.startsWith('/')) u = ORIGIN + u;
  u = u.replace(/^http:\/\/(www\.)?wcsiasc\.org/, ORIGIN).replace(/^https:\/\/www\.wcsiasc\.org/, ORIGIN);
  return u;
}
function img(u) {
  u = absUrl(u);
  if (!u || !/\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(u)) return null;
  if (u.startsWith(ORIGIN + '/wp-content/uploads/')) images.add(u);
  return u;
}
// Internal links → new site routes
function route(u) {
  u = absUrl(u);
  if (!u) return null;
  if (!u.startsWith(ORIGIN)) return u;
  const p = u.slice(ORIGIN.length).replace(/[?#].*$/, '');
  if (p.startsWith('/wp-content/')) return u;
  return p || '/';
}

const ALLOWED = new Set(['p', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'br', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'img', 'figure', 'figcaption', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'sup', 'sub', 'iframe', 'hr']);
// Sanitise WordPress HTML into a small, styleable subset.
function sanitize(html) {
  if (!html) return '';
  const $ = cheerio.load(`<div id="r">${html}</div>`, null, false);
  const r = $('#r');
  r.find('script,style,noscript,form,input,button,svg,.sharedaddy,.share_post-container').remove();
  r.find('*').each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (!ALLOWED.has(tag)) { $(el).replaceWith($(el).contents()); return; }
    const keep = {};
    if (tag === 'a') {
      const h = route($(el).attr('href'));
      if (h) keep.href = h;
      if (h && /^https?:/.test(h)) { keep.target = '_blank'; keep.rel = 'noopener'; }
    }
    if (tag === 'img') {
      const s = img($(el).attr('data-src') || $(el).attr('src'));
      if (!s) { $(el).remove(); return; }
      keep.src = s; keep.alt = $(el).attr('alt') || ''; keep.loading = 'lazy';
    }
    if (tag === 'iframe') {
      const s = $(el).attr('src') || '';
      if (!/youtube|vimeo/.test(s)) { $(el).remove(); return; }
      keep.src = s; keep.allowfullscreen = '';
    }
    if (['td', 'th'].includes(tag) && $(el).attr('colspan')) keep.colspan = $(el).attr('colspan');
    el.attribs = keep;
  });
  // unwrap spans/divs without attributes to keep markup lean
  for (let i = 0; i < 3; i++) r.find('span,div').each((_, el) => { $(el).replaceWith($(el).contents()); });
  let out = r.html() || '';
  out = out.replace(/&nbsp;/g, ' ').replace(/<p>\s*<\/p>/g, '').replace(/\s{2,}/g, ' ').trim();
  return out;
}

// ---------- Elementor widget → block ----------
function widgetBlock($, el) {
  const $el = $(el);
  const wt = ($el.attr('data-widget_type') || '').replace('.default', '');
  if (/heading/.test(wt)) $el.find('br').replaceWith(' ');
  const settings = (() => { try { return JSON.parse($el.attr('data-settings') || '{}'); } catch { return {}; } })();
  switch (wt) {
    case 'spacer': case 'wgl-events': case 'wgl-blog': case 'wgl-contact-form-7':
    case 'hotspot': case 'wgl-image-layers': case 'wgl-text-path':
      return null;
    case 'wgl-double-heading': {
      const parts = $el.find('.dblh__title').map((_, s) => clean($(s).text())).get().filter(Boolean);
      const sub = clean($el.find('.dblh__subtitle').text());
      const text = parts.join(' ');
      const body = sanitize($el.find('.dblh__content').html());
      if (!text && !body) return null;
      return { type: 'heading', text, sub: sub || undefined, body: body || undefined };
    }
    case 'heading': {
      const text = clean($el.find('.elementor-heading-title').text());
      return text ? { type: 'heading', text } : null;
    }
    case 'text-editor': {
      const html = sanitize($el.find('.elementor-widget-container').html());
      return clean(cheerio.load(html).text()) || html.includes('<img') ? { type: 'html', html } : null;
    }
    case 'html': {
      // mostly hidden buttons; keep links only
      const a = $el.find('a').first();
      if (!a.length) return null;
      return { type: 'button', text: clean(a.text()), href: route(a.attr('href')), hidden: /elementor-hidden-desktop/.test($el.attr('class')) || undefined };
    }
    case 'wgl-toggle-accordion': {
      const items = $el.find('.wgl-accordion_panel').map((_, p) => ({
        title: clean($(p).find('.wgl-accordion_title').text()),
        html: sanitize($(p).find('.wgl-accordion_content').html()),
      })).get().filter((i) => i.title || i.html);
      return items.length ? { type: 'accordion', items } : null;
    }
    case 'image': {
      const i = $el.find('img').first();
      const src = img(i.attr('data-src') || i.attr('src'));
      if (!src) return null;
      const link = $el.find('a').first().attr('href');
      // captions like "<b>Pope Francis</br></b>Head of the Catholic Church…"
      const cap = $el.find('figcaption').first();
      const capTitle = cap.find('b, strong').first().text().trim();
      const capText = cap.length ? cap.clone().find('b, strong').remove().end().text().replace(/\s+/g, ' ').trim() : '';
      return { type: 'image', src, alt: i.attr('alt') || capTitle || '', href: link ? route(link) : undefined, caption: capTitle || capText ? { title: capTitle, text: capText } : undefined };
    }
    case 'image-carousel': case 'gallery': case 'wgl-gallery': {
      const list = [];
      $el.find('img').each((_, i) => {
        const a = $(i).closest('a');
        const full = a.length && /\.(jpe?g|png|webp)$/i.test(a.attr('href') || '') ? img(a.attr('href')) : null;
        const src = img($(i).attr('data-src') || $(i).attr('src'));
        if (full || src) list.push({ src: full || src, thumb: src && src !== full ? src : undefined, alt: $(i).attr('alt') || '' });
      });
      return list.length ? { type: 'gallery', images: list } : null;
    }
    case 'video': {
      let src = $el.find('video').attr('src') || settings.youtube_url || settings.vimeo_url || settings.hosted_url?.url;
      if (!src) { const f = $el.find('iframe').attr('src') || $el.find('[data-src]').attr('data-src'); src = f; }
      if (!src) return null;
      src = absUrl(src);
      if (src.startsWith(ORIGIN)) videos.add(src);
      const yt = src.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
      return yt ? { type: 'video', youtube: yt[1] } : { type: 'video', src };
    }
    case 'button': case 'wgl-button': {
      const a = $el.find('a').first();
      const text = clean(a.text());
      if (!text) return null;
      return { type: 'button', text, href: route(a.attr('href')) || null };
    }
    case 'shortcode': case 'wgl-team': {
      const people = $el.find('.member__wrapper').map((_, m) => {
        const a = $(m).find('a[href*="/network/"]').first();
        const href = a.attr('href') || '';
        return {
          slug: href.split('/network/')[1]?.replace(/\/.*$/, '') || null,
          name: clean($(m).find('.member__name').text()),
          role: clean($(m).find('.member__role, .member__highlighted').first().text()) || undefined,
          image: img($(m).find('img').attr('data-src') || $(m).find('img').attr('src')),
        };
      }).get().filter((p) => p.name);
      if (people.length) return { type: 'people', people };
      const html = sanitize($el.find('.elementor-shortcode').html());
      return clean(cheerio.load(html).text()) ? { type: 'html', html } : null;
    }
    case 'wgl-clients': {
      const items = $el.find('.clients_item').map((_, c) => {
        const i = $(c).find('img').first();
        const href = $(c).find('a').attr('href');
        return { src: img(i.attr('data-src') || i.attr('src')), alt: i.attr('alt') || '', href: href ? route(href) : undefined };
      }).get().filter((c) => c.src);
      return items.length ? { type: 'logos', items } : null;
    }
    case 'wgl-cases': {
      const items = $el.find('.case_item').map((_, c) => {
        const $c = $(c);
        const title = clean($c.find('.wgl-cases__title, .case_title, h3, h4').first().text()) || clean($c.find('img').attr('title'));
        const sub = clean($c.find('.wgl-cases__subtitle, .case_subtitle, .wgl-cases__category').first().text());
        const href = $c.find('a').first().attr('href');
        return { title, sub: sub || undefined, image: img($c.find('img').attr('data-src') || $c.find('img').attr('src')), href: href ? route(href) : undefined, text: clean($c.find('.wgl-cases__content, .case_content').text()) || undefined };
      }).get().filter((c) => c.title || c.image);
      return items.length ? { type: 'cards', items } : null;
    }
    case 'wgl-info-box': {
      const title = clean($el.find('.wgl-infobox_title-idle, .wgl-infobox_title').first().text());
      const text = clean($el.find('.wgl-infobox_content').text());
      const href = $el.find('a').first().attr('href');
      return title || text ? { type: 'info', title, text: text || undefined, href: href ? route(href) : undefined } : null;
    }
    case 'wgl-counter': {
      return { type: 'counter', value: clean($el.find('.wgl-counter__placeholder').text()), suffix: clean($el.find('.wgl-counter__suffix').text()), title: clean($el.find('.wgl-counter_title').text()) };
    }
    case 'wgl-testimonials': {
      const items = $el.find('.testimonials__wrapper, .swiper-slide').map((_, t) => ({
        title: clean($(t).find('.item__title').text()),
        quote: clean($(t).find('.item__quote').text()).replace(/^"|"$/g, '').trim(),
        author: clean($(t).find('.author__name').text()),
      })).get().filter((t) => t.quote);
      const uniq = [...new Map(items.map((t) => [t.quote, t])).values()];
      return uniq.length ? { type: 'testimonials', items: uniq } : null;
    }
    case 'icon-list': {
      const items = $el.find('.elementor-icon-list-text').map((_, t) => clean($(t).text())).get();
      return items.length ? { type: 'list', items } : null;
    }
    case 'wgl-social-icons': {
      const items = $el.find('a').map((_, a) => ({ href: $(a).attr('href'), label: clean($(a).text()) || $(a).attr('class') })).get();
      return { type: 'social', items };
    }
    default: {
      const text = clean($el.text());
      return text ? { type: 'html', html: `<p>${text}</p>`, unknown: wt } : null;
    }
  }
}

// Walk an Elementor document in order, tagging blocks with their section anchor.
function elementorBlocks($, root) {
  const blocks = [];
  const walk = (el, section) => {
    const $el = $(el);
    const id = $el.attr('id');
    if (id && /elementor-top-section|e-con|elementor-section/.test($el.attr('class') || '')) section = id;
    if ($el.attr('data-widget_type')) {
      if ($el.attr('data-widget_type') === 'template.default') { $el.children().each((_, c) => walk(c, section)); return; }
      const b = widgetBlock($, el);
      if (b) { if (section) b.section = section; blocks.push(b); }
      return;
    }
    $el.children().each((_, c) => walk(c, section));
  };
  root.each((_, r) => walk(r, null));
  // merge consecutive html blocks of the same section
  const merged = [];
  for (const b of blocks) {
    const last = merged.at(-1);
    if (b.type === 'html' && last?.type === 'html' && last.section === b.section && !b.unknown && !last.unknown) last.html += b.html;
    // consecutive captioned images (portraits with name + role) become one figure grid
    else if (b.type === 'image' && b.caption?.title && (last?.type === 'figures' || (last?.type === 'image' && last.caption?.title))) {
      if (last.type === 'image') merged.splice(-1, 1, { type: 'figures', section: last.section, items: [last] });
      merged.at(-1).items.push(b);
    } else merged.push(b);
  }
  return merged;
}

function loadPage(url) {
  const html = htmlFile(url);
  if (!html) return null;
  const $ = cheerio.load(html);
  $('[data-elementor-type=header],[data-elementor-type=footer],header.wgl-theme-header,footer').remove();
  return $;
}
const meta = ($, p) => $(`meta[property="${p}"]`).attr('content') || $(`meta[name="${p}"]`).attr('content');

// ---------- taxonomies ----------
const teamCats = Object.fromEntries(readJSON('team_cat.json').map((c) => [c.id, c.slug]));
const postCats = Object.fromEntries(readJSON('categories.json').map((c) => [c.id, { slug: c.slug, name: decode(c.name) }]));

// ---------- people ----------
const people = listJSON('team').map((t) => {
  const url = t.link;
  const $ = loadPage(url);
  let image = null, headline = null;
  if ($) {
    image = img($('.member__thumbnail img').attr('src')) || img(meta($, 'og:image'));
    headline = clean($('.member__highlighted').first().text()) || null;
    var socials = $('.member__socials a, .team__member .social__icon').map((_, a) => $(a).attr('href')).get().filter((h) => h && /^https?:/.test(h));
  }
  const bio = sanitize(t.content.rendered);
  return {
    slug: t.slug,
    name: decode(t.title.rendered),
    headline,
    image,
    bio,
    excerpt: clean(decode(t.excerpt?.rendered?.replace(/<[^>]+>/g, ''))).replace(/\s*…\.?$|\.\.\.$/, '…') || null,
    categories: (t.team_category || []).map((id) => teamCats[id]).filter(Boolean),
    socials: [...new Set(socials || [])],
    date: t.date,
  };
});

// ---------- awards ----------
const awards = listJSON('awards').map((a) => {
  const $ = loadPage(a.link);
  const image = $ ? img($('.blog-post_media img').attr('src')) || img(meta($, 'og:image')) : null;
  return { slug: a.slug, name: decode(a.title.rendered), image, html: sanitize(a.content.rendered), date: a.date };
});

// ---------- posts ----------
const posts = listJSON('posts').map((p) => {
  const $ = loadPage(p.link);
  let image = $ ? img(meta($, 'og:image')) : null;
  return {
    slug: p.slug,
    title: decode(p.title.rendered),
    date: p.date,
    categories: (p.categories || []).map((c) => postCats[c]?.slug).filter(Boolean),
    excerpt: clean(decode((p.excerpt?.rendered || '').replace(/<[^>]+>/g, ''))),
    image,
    html: sanitize(p.content.rendered),
  };
}).sort((a, b) => b.date.localeCompare(a.date));

// ---------- locations ----------
const locUrls = fs.readFileSync(path.join(CRAWL, 'urls.txt'), 'utf8').split('\n').filter((u) => u.includes('/events/locations/'));
const locations = locUrls.map((u) => {
  const $ = loadPage(u);
  const slug = u.split('/events/locations/')[1].replace(/\/$/, '');
  const main = $('main');
  const name = clean(main.find('h1, h2').first().text()) || slug;
  const txt = main.text().replace(/ /g, ' ');
  const addr = clean((txt.match(/Address\s+([\s\S]*?)\s+Description/) || [])[1] || '');
  // description = html after the "Description" heading
  let descHtml = '';
  main.find('h3,h4,h5,h6,strong,b,p,div').each((_, e) => {
    if (descHtml) return;
    if (clean($(e).text()) === 'Description') {
      const parts = [];
      let n = $(e).next();
      while (n.length) { parts.push($.html(n)); n = n.next(); }
      descHtml = sanitize(parts.join(''));
    }
  });
  const image = img(main.find('img').first().attr('src')) || img(meta($, 'og:image'));
  return { slug, name, address: addr || null, html: descHtml, image };
});

// ---------- events ----------
const evUrls = fs.readFileSync(path.join(CRAWL, 'urls.txt'), 'utf8').split('\n').filter((u) => /\/events\/(?!locations\/)[^/]+\/$/.test(u));
const MONTHS = 'January February March April May June July August September October November December'.split(' ');
function parseDates(s) {
  // e.g. "July 5, 2023", "November 25, 2024 - November 26, 2024", "September 18, 2025 - September 21, 2025"
  const re = new RegExp(`(${MONTHS.join('|')}) (\\d{1,2}), (\\d{4})`, 'g');
  const found = [...s.matchAll(re)].map((m) => `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`);
  return { start: found[0] || null, end: found[1] || found[0] || null };
}
const events = evUrls.map((u) => {
  const $ = loadPage(u);
  const slug = u.split('/events/')[1].replace(/\/$/, '');
  const wrap = $('.em-item-single, .em-event-single').first();
  const title = clean(meta($, 'og:title')?.replace(/ - WCS$/, '')) || slug;
  const dateBlock = wrap.find('.event-single_content.calendar p').first();
  const dateText = clean(dateBlock.html()?.replace(/<br\s*\/?>/g, ' | ').replace(/<[^>]+>/g, '') || '');
  const [dPart, tPart] = dateText.split('|').map((s) => clean(s));
  const locA = wrap.find('.event-single_content.location a').first();
  const locSlug = (locA.attr('href') || '').split('/events/locations/')[1]?.replace(/\/$/, '') || null;
  const { start, end } = parseDates(dPart || '');
  const content = wrap.find('.em-event-content').first();
  let blocks = content.find('[data-elementor-type]').length ? elementorBlocks($, content.find('[data-elementor-type]').first()) : [];
  if (!blocks.length) {
    const html = sanitize(content.html());
    if (clean(cheerio.load(html).text())) blocks = [{ type: 'html', html }];
  }
  const poster = img(meta($, 'og:image'));
  return {
    slug, title, start, end,
    dateLabel: dPart || null,
    timeLabel: tPart || null,
    location: locSlug,
    locationName: clean(locA.text()) || null,
    poster,
    description: clean(meta($, 'og:description')),
    blocks,
  };
}).sort((a, b) => (b.start || '').localeCompare(a.start || ''));

// ---------- static pages (Elementor) ----------
const PAGE_SLUGS = [
  '', 'our-mission', 'history', 'about-us', 'board-of-directors', 'ambassadors', 'our-team', 'contacts', 'donate',
  'yougiveuscourage', 'venue', 'locations', 'terms-conditions', 'world-changers-economic-summit', 'world-changers-biohacking-summit',
  'world-changers-power-womens-summit', 'emotions-revealed', 'spirit-of-quantum', 'formal-award-ceremony-12-of-october', 'speakers', 'guests',
  'network-list', 'upcoming-events', 'completed-events', 'events-cat', 'gallery', 'blog',
];
const restPages = listJSON('pages');
const pages = {};
for (const slug of PAGE_SLUGS) {
  const url = `${ORIGIN}/${slug ? slug + '/' : ''}`;
  const $ = loadPage(url);
  if (!$) { console.warn('missing page', url); continue; }
  const root = $('main [data-elementor-type="wp-page"]').first();
  const rest = restPages.find((p) => p.link === url);
  const blocks = root.length ? elementorBlocks($, root) : [{ type: 'html', html: sanitize(rest?.content?.rendered) }];
  pages[slug || 'home'] = { slug, title: decode(rest?.title?.rendered || slug), image: img(meta($, 'og:image')), blocks };
}

// ---------- galleries ----------
const galleries = restPages.filter((p) => /gallery/i.test(p.slug) && p.slug !== 'gallery').map((p) => {
  const $ = loadPage(p.link);
  const imgs = [];
  $('main .wgl-gallery_item').each((_, a) => {
    const full = img($(a).attr('href'));
    const thumb = img($(a).find('img').attr('src'));
    if (full || thumb) imgs.push({ src: full || thumb, thumb: thumb !== full ? thumb : undefined });
  });
  if (!imgs.length) $('main img').each((_, i) => { const s = img($(i).attr('data-src') || $(i).attr('src')); if (s) imgs.push({ src: s }); });
  return { slug: p.slug, title: decode(p.title.rendered).replace(/\s+Gallery$/i, '').trim(), date: p.date, images: [...new Map(imgs.map((i) => [i.src, i])).values()] };
}).filter((g) => g.images.length);

// ---------- registration forms (kept as external links to the live forms) ----------
const forms = restPages.filter((p) => /registration-form/.test(p.slug)).map((p) => ({ slug: p.slug, title: decode(p.title.rendered), url: p.link }));

// ---------- write ----------
const write = (name, data) => fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(data, null, 1));
write('people', people);
write('awards', awards);
write('posts', posts);
write('locations', locations);
write('events', events);
write('pages', pages);
write('galleries', galleries);
write('forms', forms);
fs.writeFileSync(path.join(CRAWL, 'images.txt'), [...images].sort().join('\n'));
fs.writeFileSync(path.join(CRAWL, 'videos.txt'), [...videos].sort().join('\n'));

const unknown = {};
for (const e of [...events, ...Object.values(pages)]) for (const b of e.blocks) if (b.unknown) unknown[b.unknown] = (unknown[b.unknown] || 0) + 1;
console.log({ people: people.length, awards: awards.length, posts: posts.length, locations: locations.length, events: events.length, pages: Object.keys(pages).length, galleries: galleries.length, galleryImages: galleries.reduce((s, g) => s + g.images.length, 0), images: images.size, videos: videos.size, unknown });
