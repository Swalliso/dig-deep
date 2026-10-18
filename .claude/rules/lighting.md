---
paths:
  - "src/world/lighting.ts"
  - "src/render/renderer.ts"
  - "src/systems/dread.ts"
  - "src/entities/flare.ts"
  - "tests/lighting.test.ts"
  - "tests/dread.test.ts"
---

# Lighting, dread and the light rules

- **Light map**: `World.onTileChange` (a list of listeners; tile entities and the map image
  listen too) tells the `LightMap` about every tile change. It relights only the box within
  light reach of the changes (plus any stretch of a column whose sky light moved), once per
  update step. Tests check incremental relighting (with moving lights) against a full recompute;
  keep them passing when touching lighting.
- **Light sources** are tiles with `TileDef.light` (the camp's stove, Phase 15, is one: a
  campfire whose light is established, so the camp heals). Gem lamps shine past `LIGHT_MAX`,
  which only means the tiles near them are fully lit for longer. A torch in the Fungal Hollows' damp air
  gives `torchLight()` instead, which depends only on where it is.
- **Moving lights** (`setMovingLight`: the held lantern, flares) are kept apart from that
  established light, each in a small patch relit only when it moves to another tile or a tile in
  its patch changes. `level()` is the max of both, and `established()` leaves moving lights out.
- Light has no color: glowing tiles' colored glow (`TileDef.glowColor`) is drawn on top by the
  renderer only.
- **Light rules** (Phase 13's light design gate, decided with the user): any light at the
  player's tile of at least `DREAD_SAFE_LIGHT` keeps dread from rising and drains it, carried
  light included. Health only regenerates in *established* light (sky, torches, glowing tiles).
  No fuel or other meter for now; a balance pass (maybe lantern fuel) is backlogged in
  ROADMAP.md.
- **Player glow**: a faint ~3-tile glow around the player (`PLAYER_GLOW`) so you can see where to
  put a torch in a pitch-black cave. It's applied when drawing the darkness overlay only; the
  light map (and "caves are dark") is unaffected, so it never keeps dread away. It's drawn like
  any other light, with no special tint: the dread meter and the status line under it tell the
  player they're unsafe (agreed with the user in Phase 13).
- Light spreads diagonally too (reviewed and kept).
