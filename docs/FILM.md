# Welcome film (home page)

The home page opens with a 12-second film: the sky above Rome with white doves, a descent through the clouds to St. Peter's Square, then Sir Prof. Dr. Gabriele Pao-Pei Andreoli on a terrace facing the dome. He holds the IASC medal and says *"Hello, and welcome to the World Changers Summit."*

> **AI-generated.** Every frame and the voice were generated with Higgsfield. It is not footage of a real event. The founder's face comes from photos on the old site, and the voice is synthetic. **Get the founder's approval before this goes live on the real domain.**

## How it was made

| Step | Model | Input | Cost |
|---|---|---|---|
| End frame: founder at the Vatican with the medal | Seedream 5.0 Pro, 2k, 16:9 | `docs/film/ref-founder.webp` (from `/media/2023-09/gabrieleandreoli.webp`), `docs/film/ref-medal.webp` (crop of a supplied photo) | 2.5 credits |
| Start frame: sky, doves, Vatican through the clouds | Seedream 5.0 Pro, 2k, 16:9 | text only | 2.5 credits |
| Draft video, 480p | Seedance 2.5, `omni_reference`, 12 s, `draft` | start frame, end frame, founder reference | 36 credits |
| Final video, 1080p | Seedance 2.5, `omni_reference`, 12 s | same inputs | 192 credits |

The video prompt is in `docs/film/video-prompt.txt`. The start and end frames are in `docs/film/`.

## Encoding for the web

```sh
FFMPEG=/path/to/ffmpeg sh scripts/film.sh final.mp4
```

This writes these files to `public/film/`:

- `welcome-1080.mp4`, used on large screens
- `welcome-720.mp4`, used on phones and with data saver
- `welcome-poster.webp`, the first frame
- `welcome-end.webp`, the last frame. It is the poster for visitors with reduced motion, who see the founder and press play themselves.

## Behaviour (`src/components/WelcomeFilm.astro`, `src/scripts/film.ts`)

- **Playback.** Autoplays muted, because browsers block autoplay with sound. **Sound on** restarts the film with the voice.
- **Captions.** Timed place labels (IT, then VA, then WCS) and an English subtitle for the greeting. The timings are in the component.
- **Controls.** Pause, play and replay. The film pauses when scrolled out of view.
- **Map intro.** The earlier map intro (`Intro.astro`) now plays only on request at `/?intro=1`, linked from the Atlas section.
