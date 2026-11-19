# Photographic Earth on the atlas globe

The globe on the home page and on `/world-map/` has two layers:

- **`src/scripts/earth.ts`** is a WebGL sphere drawn with three.js. It has a NASA Blue Marble surface, relief, a specular highlight on the water, drifting clouds, a thin atmosphere and a few stars.
- **`src/scripts/globe.ts`** is the 2D layer on top. It draws host-country outlines, arcs, markers and labels with the same d3-geo orthographic view, so dragging, zoom, the year filter and "Play the journey" behave as before.

Without WebGL, and while the textures load, the globe falls back to the dotted paper atlas.

## Textures (`public/earth/`)

| File | Source | Size |
|---|---|---|
| `day-4k.webp`, `day-2k.webp` (2K is used on phones) | NASA Blue Marble (public domain), from the `three-globe` package (`example/img/earth-blue-marble.jpg`) | 540 KB / 190 KB |
| `bump.webp` | relief map from the same package (`earth-topology.png`) | 32 KB |
| `water.webp` | land/water mask from the same package (`earth-water.png`) | 37 KB |
| `clouds.webp` | alpha channel of `example/clouds/clouds.png` from the same package | 260 KB |

NASA imagery is public domain. The globe legend credits it as "Earth imagery: NASA Blue Marble".
