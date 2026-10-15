# Dig Deep — project notes for Claude

Side-view 2D mining/building sandbox that runs in the browser. The original design lives in
`SPEC.md` (phases 1–7, all done); what comes next is planned in `ROADMAP.md` (phases 8+). This
file is the short version plus the working rules.

## How we work

- The game is built in phases: 1–7 at the end of `SPEC.md` (done), 8+ in `ROADMAP.md`.
  Implement **only** the phase the user asks for. Don't build later-phase features early, even
  small ones. ROADMAP.md's "Shared foundations" table says which phase builds each shared system.
- Don't refactor earlier phases unless the current phase needs it; say so when you do.
- At the end of a phase: `npm test`, `npm run build`, run `npm run dev`, then give the user
  exact steps to check that phase's acceptance criteria and stop.
- Each phase is built on its own branch, `feature/phase-N-short-name`, made from `develop`.
  The user commits on that branch after every working phase.
- **Branches and deployment** (repo github.com/Swalliso/dig-deep):

  | Branch | Role | Deploys to |
  | --- | --- | --- |
  | `main` | Production; changes only through a release PR from `develop`, or a hotfix | https://swalliso.github.io/dig-deep/ |
  | `develop` | Integration; finished phases are merged here by PR | https://swalliso.github.io/dig-deep/dev/ |
  | `feature/…` | One per phase or extra, from `develop` | nothing (`ci.yml` tests and builds it) |
  | `hotfix/…` | Urgent live fix from `main`; PR into `main`, then merge `main` into `develop` | via `main` |

  Every push to `main` or `develop` runs `.github/workflows/deploy.yml`, which tests and builds
  both branches (develop with `npm run build:dev`) and publishes them as one Pages site, so
  pushing either branch publishes. `ci.yml` runs tests plus both builds on PRs and on feature and
  hotfix pushes. **Only push, open PRs or merge when the user asks**, and never touch `main`
  without being asked for a release or hotfix. Commits in this repo use the GitHub no-reply
  address (set in the local git config).
- **Dev-site builds** (`--mode develop`, see `src/channel.ts`) save under `dig-deep-dev:` keys,
  title the page "Dig Deep (dev)" and show a DEV BUILD tag on the title screen. Both sites share
  the swalliso.github.io origin, so every IndexedDB/localStorage key must go through
  `storageKey()`; the live keys (`dig-deep:save`) must never change.

## Changes from SPEC.md (agreed with the user)

These override the spec. Don't revert them.

- **Mining damage persists per tile.** The spec resets break progress when the cursor moves
  to another tile; instead each tile keeps its damage (and cracks) until it breaks, even if
  the cursor moves away or the button is released.
- **Trees fall.** Breaking a trunk tile also breaks the trunk above it and the tree's canopy
  (wood drops, leaves just burst); the stump below the cut stays.
- **Player glow.** A faint ~3-tile glow around the player (`PLAYER_GLOW`) so you can see where
  to put a torch in a pitch-black cave. It's applied when drawing the darkness overlay only;
  the light map (and "caves are dark") is unaffected.
- **Diagonal light**, **"Height: N m"** above the surface level, and the floating "Need better
  pickaxe" hint (instead of a toast) were all reviewed and kept.
- **Saving soon after changes.** Besides the spec's 60 s autosave and save-on-pause, anything
  that changed is saved within `SAVE_CHANGES_AFTER` (2 s), because browsers drop IndexedDB
  writes made while a page unloads. New world asks for a second click if it would replace a
  working save.

## Debug mode

Add `debug` to the URL (`http://localhost:5173/?seed=42&debug`) to turn on testing shortcuts:
**G** gives a materials kit (enough for every recipe, plus a workbench and furnace), **F**
toggles fly mode (no gravity or collision; W/S or ↑/↓ for up/down, Shift for 4x speed), and
**I** cycles instant mining off → 1x1 → 3x3 brush (reach and pickaxe-tier rules still apply,
bedrock stays unbreakable, drops and tree felling work as normal), and **L** toggles lighting
(fullbright) for exploring. Debug mode also opens the F3 overlay at start, and the title screen
gets a button that marks the save as an older version (to test the version-mismatch screen). All cheats live in
`src/debug.ts`. When a new phase adds something slow to reach by playing, add
a shortcut there and mention it in the phase's test steps.

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
index.html           page shell, menu styles, favicon link
vite.config.ts       base './' so dist/ works from any folder on any static host; dev-site title
                     and noindex for `--mode develop`
.github/workflows/   deploy.yml (main + develop → Pages), ci.yml (PRs, feature/hotfix branches)
public/favicon.svg   pixel-art favicon (copied into dist/ as is)
public/og-image.png  1200x630 link-preview image (Discord/Slack/etc., via the og:/twitter: tags in
                     index.html, which use absolute swalliso.github.io URLs). Rendered with the
                     game's own renderer: seed 42, view centred on tile x 821 from row 112, with a
                     shaft, three torches and a few ores added, then upscaled 2x nearest-neighbour
README.md            how to play, develop, branches and deploys
SPEC.md              original design and phases 1–7
ROADMAP.md           post-MVP design and phases 8+
src/
  main.ts            boot, screens (title → loading → playing ⇄ paused), game loop, saving
  game.ts            one play session: world, player, inventory, mining, lighting, HUD
  config.ts          every tunable number
  channel.ts         live vs dev-site build, storageKey() for every saved key
  input.ts           keyboard + mouse state
  debug.ts           ?debug testing shortcuts (materials kit, fly mode, instant mining)
  util/rng.ts        seeded PRNG (shared by world gen and textures)
  world/
    tiles.ts         tile registry (id, name, hardness, min tier, color, drop, solid)
    world.ts         chunked tile storage (32x32 Uint8Array chunks), get/set tile
    generate.ts      seeded terrain, caves, ores, trees, bedrock, spawn
    trees.ts         felling: cutting a trunk removes the tree above the cut
    lighting.ts      per-tile light: sky columns + torches, spread with falloff, incremental relight
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
    save.ts          save format (seed + changed chunks, RLE) + IndexedDB slot via idb-keyval
  render/
    camera.ts        camera position, clamping
    textures.ts      procedural 16x16 tile, crack and item-icon atlases, built once at startup
    renderer.ts      sky, underground backdrop, cached chunk canvases, light overlay, entities
    particles.ts     cosmetic break particles (Math.random is fine here)
  ui/
    hud.ts           hotbar, toasts, depth meter, F3 debug overlay, slot/stack drawing helpers
    menus.ts         inventory + crafting panel (canvas); title, controls, pause (HTML in #ui)
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
- **Lighting**: `World.onTileChange` tells the `LightMap` about every tile change; it relights
  only the box within light reach of the changes (plus any stretch of a column whose sky light
  moved), once per update step. A test checks incremental relighting against a full recompute;
  keep it passing when touching lighting.
- **Saves**: a save is the seed plus only the chunks changed since generation (the rest is
  regenerated), so **bump `SAVE_VERSION` in `systems/save.ts` whenever world generation, tile
  ids, chunk/world size or the save format change**; old saves then show "Save from an older
  version" instead of loading wrong. Items lying on the ground are saved (as an optional
  `drops` field; adding optional fields like that needs no version bump). Particles and
  half-mined tile damage aren't saved.
- **Performance**: hold 60 FPS. Never do per-frame work over the whole world. World
  generation must take under 2 s.
- Keep modules small and focused. Prefer plain functions and data over class hierarchies.
