# Dig Deep — project notes for Claude

Side-view 2D mining/building sandbox that runs in the browser. Full design lives in `SPEC.md`;
this file is the short version plus the working rules.

## How we work

- The game is built in the 7 phases listed at the end of `SPEC.md`. Implement **only** the phase
  the user asks for. Don't build later-phase features early, even small ones.
- Don't refactor earlier phases unless the current phase needs it; say so when you do.
- At the end of a phase: `npm test`, `npm run build`, run `npm run dev`, then give the user
  exact steps to check that phase's acceptance criteria and stop.
- The user commits after every working phase.
- Out-of-scope items (combat, day/night, liquids, sound, etc.) wait until all 7 phases pass.

## Changes from SPEC.md (agreed with the user)

These override the spec. Don't revert them.

- **Mining damage persists per tile.** The spec resets break progress when the cursor moves
  to another tile; instead each tile keeps its damage (and cracks) until it breaks, even if
  the cursor moves away or the button is released.
- **Trees fall.** Breaking a trunk tile also breaks the trunk above it and the tree's canopy
  (wood drops, leaves just burst); the stump below the cut stays.

## Stack

| Piece     | Choice                                                    |
| --------- | --------------------------------------------------------- |
| Language  | TypeScript, `strict` mode                                 |
| Build     | Vite (`npm run dev`, `npm run build`)                     |
| Rendering | Plain HTML5 Canvas 2D. No game engine.                    |
| Noise     | `simplex-noise`                                           |
| Tests     | Vitest (`npm test`), files in `tests/`                    |
| Saves     | `idb-keyval` (IndexedDB), added in Phase 6                |
| Art       | Procedural pixel art generated in code; no external assets |

## Folder layout

```
src/
  main.ts            boot, game loop (fixed 60 Hz update, render each frame)
  config.ts          every tunable number
  input.ts           keyboard + mouse state
  util/rng.ts        seeded PRNG (shared by world gen and textures)
  world/
    tiles.ts         tile registry (id, name, hardness, min tier, color, drop, solid)
    world.ts         chunked tile storage (32x32 Uint8Array chunks), get/set tile
    generate.ts      seeded terrain, caves, ores, trees, bedrock, spawn
    trees.ts         felling: cutting a trunk removes the tree above the cut
  entities/
    player.ts        movement, jump, tile collision, auto step-up
    itemDrop.ts      dropped items: fall, fly to the player within 2 tiles, picked up on touch
  systems/
    items.ts         item registry (name, max stack, tile it places, icon, pickaxe tier)
    inventory.ts     40 slots (10 hotbar + 30 bag), stacking, cursor stack, shift-move,
                     best pickaxe, starting items
    mining.ts        reach + tier checks, break progress, crack stage, hints
    building.ts      placement rules (empty, in reach, supported, not on the player)
    crafting.ts      recipe table, station range checks, craft()
    save.ts                                       (Phase 6)
  render/
    camera.ts        camera position, clamping
    textures.ts      procedural 16x16 tile, crack and item-icon atlases, built once at startup
    renderer.ts      sky, cached chunk canvases, overlays
    particles.ts     cosmetic break particles (Math.random is fine here)
  ui/
    hud.ts           hotbar, slot/stack drawing helpers, debug text (depth meter, toasts: Phase 5)
    menus.ts         inventory + crafting panel (pause and title screens: Phase 6)
tests/               Vitest unit tests (world gen, inventory, crafting)
```

`util/rng.ts`, `render/textures.ts` and `systems/items.ts` are small additions to the spec's
layout. Item ids are string keys of `ITEMS` (`'dirt'`, `'copper_ore'`, ...); tiles name the item
they drop.

## Conventions

- **Coordinates**: tile coords are integers named `tx`, `ty`. World pixel coords are floats named
  `x`, `y`. `TILE_SIZE = 16`. `ty` grows downward (row 0 is the top of the sky).
- **Depth**: `depth = ty - SURFACE_LEVEL` (`SURFACE_LEVEL = 120`), so 1 tile = 1 m and 0 m is the
  average surface. Ore depth ranges in the spec use this depth. Deepstone starts at absolute
  row 350, as the generation section says.
- **Tunables**: every tunable number (gravity, speeds, world size, gen parameters) lives in
  `src/config.ts`. Per-tile data (hardness, min tier, color, drop) lives in the tile registry.
- **World**: 1000 x 600 tiles, stored as 32 x 32 chunks. Out-of-bounds reads return Bedrock.
  The same seed must always produce the identical world, so all randomness in generation
  goes through the seeded RNG. Never use `Math.random()` in generation.
- **Loop**: fixed-timestep `update(dt)` at 60 Hz; `render()` once per `requestAnimationFrame`.
  Moving things (player, camera) keep `prevX`/`prevY`, and render interpolates between the
  last two update steps so motion stays smooth on high-refresh screens. Keyboard edge
  presses (`wasPressed`) are cleared after each update step.
- **Physics**: player intent comes in as a plain `PlayerControls` object, so physics can be
  unit-tested without the DOM. Movement is split into steps of at most `MAX_MOVE_STEP` px,
  resolved X then Y, so nothing tunnels through tiles.
- **Rendering**: `imageSmoothingEnabled = false`, integer camera positions, 2x or 3x pixel scale
  chosen by window size. Only draw what's on screen; chunk images are cached and redrawn only
  when one of their tiles changes (tracked with per-chunk version numbers).
- **Performance**: hold 60 FPS. Never do per-frame work over the whole world. World
  generation must take under 2 s.
- Keep modules small and focused. Prefer plain functions and data over class hierarchies.
