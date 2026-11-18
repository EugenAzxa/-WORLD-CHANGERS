# World Changers — Design System (MASTER)

Source of truth for the site's visual language. Page-specific overrides go in `design-system/pages/<page>.md`.
Built with the `ui-ux-pro-max` database (style: **Swiss Modernism 2.0**, pattern: **Storytelling + Data**, dials: variance 6 · motion 4 · density 3) and adapted to the brand (IASC green knot, WCS gold disc).

## Principles
1. **Editorial, not decorative.** Typography, grid and photography carry the design. No gradients, glows, glass, blobs or drop shadows.
2. **One accent.** Ink on paper; IASC green is the only accent. WCS gold lives only in the logo.
3. **Rules, not boxes.** Content is separated by 1px hairlines and whitespace, not rounded cards. Corners are square (radius 0; 2px max on inputs).
4. **Archival metadata.** Dates, coordinates, counts and country codes are set in mono, uppercase, tracked — like a museum catalogue.
5. **Numbered sections.** Long pages are indexed `01 — Map`, `02 — Next gathering`… to give rhythm and orientation.
6. **No emoji.** Countries use ISO codes (VA, IT, CH…), icons are inline SVG (1.5px stroke).

## Tokens (3 layers) — implemented in `src/styles/tokens.css`
- **Primitive:** `--paper-*`, `--ink-*`, `--green-*`, `--gold-*`, `--space-*` (4px base: 4 8 12 16 24 32 48 64 96 128), `--size-*` type scale, fonts.
- **Semantic:** `--color-bg`, `--color-bg-alt`, `--color-surface`, `--color-fg`, `--color-fg-muted`, `--color-line`, `--color-line-strong`, `--color-accent`, `--color-accent-hover`, `--color-accent-tint`, `--color-inverse-bg`, `--color-inverse-fg`, `--font-display`, `--font-text`, `--font-mono`.
- **Component:** `--btn-*`, `--tag-*`, `--card-*`, `--header-*`, `--globe-*`.

## Color
| Token | Value | Use | Contrast on bg |
|---|---|---|---|
| paper-100 (bg) | #F5F2EC | page | — |
| paper-200 (bg-alt) | #ECE7DE | alternating sections, globe stage | — |
| paper-0 (surface) | #FFFFFF | inputs, panels | — |
| ink-900 (fg) | #111111 | text, rules, primary buttons | 16.9:1 |
| ink-600 (fg-muted) | #5C5850 | secondary text | 6.3:1 |
| line | #D6CFC2 | hairlines | — |
| green-700 (accent) | #1F5A3D | links hover, active states, globe markers | 7.3:1 |
| green-800 | #174730 | accent hover | 9.5:1 |
| green-100 | #DCE6DE | accent tint (country fill, selection) | — |
| ink-950 (inverse) | #0E0E0D | footer, CTA band | paper text 17:1 |

## Typography
- Display / headings: **Newsreader** 400–500, optical size, tracking −0.02em, line-height 0.95–1.1. Italic for emphasis.
- Text / UI: **Public Sans** 400/500/600, body 17px / 1.6.
- Meta: **IBM Plex Mono** 400/500, 11–13px, uppercase, tracking 0.06em.
- Scale: 12 · 13 · 15 · 17 · 20 · 24 · 32 · 44 · 60 · 84 · 120 (fluid with clamp).

## Components
| Component | Default | Hover | Active / Selected | Focus |
|---|---|---|---|---|
| Button primary | ink bg, paper text, 0 radius, 48px | green bg | — | 2px green outline, 3px offset |
| Button secondary | 1px ink border, transparent | ink bg, paper text | — | same |
| Link | ink, 1px underline offset 4px | green | — | same |
| Tag / filter | mono 11px, 1px line border | ink border | ink bg, paper text (`aria-pressed`) | same |
| Event card | flat, 4:5 image, mono date, serif title, mono place | image scale 1.03, title underline | — | outline on card |
| Person card | grayscale 4:5 photo | photo to colour | — | outline |
| Section head | top 1px ink rule; mono index left, serif title right | — | — | — |

## Motion
Standard (dial 4): 200–300ms ease-out on hover; reveal on scroll = 12px rise + fade, 500ms, once. Globe auto-rotation pauses on interaction. Everything disabled under `prefers-reduced-motion`.

## Layout
12-column grid, max width 1320px, gutter 24px (16px mobile side padding). Breakpoints 375 / 768 / 1024 / 1440. Touch targets ≥ 44px.

## Avoid
Gradients and glows · rounded "cards everywhere" · pill chips · emoji icons · centered-everything heroes · marquee carousels · gold text effects · fake urgency.
