---
paths:
  - "src/render/**/*.ts"
  - "src/audio/**/*.ts"
  - "src/ui/hud.ts"
  - "public/**"
  - "index.html"
  - "tests/parallax.test.ts"
  - "tests/juice.test.ts"
---

# Rendering, art and audio

- **Rendering**: `imageSmoothingEnabled = false`, integer camera positions, 2x or 3x pixel scale
  chosen by window size. Only draw what's on screen; chunk images are cached and redrawn only
  when one of their tiles changes (tracked with per-chunk version numbers). Moving things
  (player, camera) are drawn interpolated between their last two update steps (`prevX`/`prevY`).
- `render/textures.ts` builds the procedural 16x16 tile, crack and item-icon atlases once at
  startup; there are no image assets. `render/parallax.ts` builds each world's background layers
  from its seed as repeating strips (the surface's clouds, mountains and hills, and each
  stratum's underground set); the layer sets are in `config.ts`.
- `render/particles.ts` is cosmetic, so `Math.random` is fine there (never in generation).
- **Audio** (`audio/sfx.ts`): every sound is synthesized with Web Audio (no audio files) and
  starts on the first click or key press. A stratum's ambience (a looping bed plus events) is
  quieter while the panel, the map or the death screen pauses the world, fades out on the pause
  menu and the title screen, and its events (drips, chimes) are timed on the session clock.
- **Mixing** (playtest P1-01): effects → SFX volume → effects limiter → master volume → master
  limiter; the ambience joins at the master volume, skipping the effects limiter, so a burst of
  effects never pushes it down. Ambient events have their own voice budget
  (`AMBIENCE_MAX_VOICES`). Noise layers loop their buffer, so a layer longer than what's left
  after its random start never stops dead. Check level changes offline (an OfflineAudioContext
  standing in for `AudioContext` before the first gesture renders the real sounds).
- **`public/og-image.png`**: the 1200x630 link-preview image (used by the og:/twitter: tags in
  `index.html`, which need absolute swalliso.github.io URLs). It was rendered with the game's own
  renderer: seed 42, view centred on tile x 821 from row 112, with a shaft, three torches and a
  few ores added, then upscaled 2x nearest-neighbour.
