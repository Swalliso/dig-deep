# Browser Mining Game – Build Spec for Claude Code

Oct 15, 2026 · @Sam

## How to use this spec with Claude Code

Build the game one phase at a time, testing in the browser after each phase, rather than asking for everything at once.

1. Create an empty folder, export this doc as Markdown, and save it in the folder as `SPEC.md`.
2. Start Claude Code in that folder and paste the kickoff prompt below.
3. After each phase, run the game, play it for a few minutes, and report anything that feels wrong before saying "continue to the next phase".
4. Commit to git after every working phase so you can roll back a bad change.

Kickoff prompt to paste:

```markdown
Read SPEC.md fully. We are building this game in phases. Implement ONLY Phase 1 now.
Before writing code, create CLAUDE.md summarizing the stack, folder layout, and coding
conventions from the spec. When Phase 1 is done, run the dev server, confirm it builds
with no errors, and list exactly how I should test the acceptance criteria. Then stop
and wait for me.
```

For each later phase: "Implement Phase N from SPEC.md. Don't refactor earlier phases unless needed; tell me if you do."

## Game overview and core loop

A single-player, side-view 2D sandbox where the player digs down through layered terrain, collects ores, crafts better tools, and builds with the blocks they collect. Working title: **Dig Deep**.

Core loop: **dig → collect → craft better pickaxe → dig deeper into harder, more valuable layers → build a base**.

Design pillars:

- **Satisfying digging**: blocks crack visibly, break with a small particle burst, and drop items that fly to the player.
- **Readable depth progression**: each layer down looks different and holds better ores that need a better pickaxe.
- **Simple, not shallow**: few systems, each one polished. No combat or enemies in the first version.
- **Runs anywhere**: plays smoothly in a desktop browser at 60 FPS with no install.

## Tech stack and project structure

Use TypeScript + Vite + plain HTML5 Canvas 2D, with no game engine, so the code stays small and easy for Claude Code to reason about.

| Choice | Decision | Why |
| --- | --- | --- |
| Language | TypeScript (strict mode) | Catches bugs in tile/coordinate math early |
| Build tool | Vite | Instant dev server, one-command static build |
| Rendering | Canvas 2D | Enough for a tile game; no engine to learn |
| Noise | `simplex-noise` npm package | Terrain and cave generation |
| Tests | Vitest | Unit tests for world gen, inventory, crafting |
| Art | Procedural/pixel art drawn in code or one sprite sheet PNG | No external asset dependencies |

Folder layout:

```markdown
src/
  main.ts            # boot, game loop (fixed 60 Hz update, render each frame)
  config.ts          # all tunable numbers in one place
  world/
    tiles.ts         # tile type registry (id, name, hardness, color, drops)
    world.ts         # chunked tile storage, get/set tile
    generate.ts      # seeded terrain, caves, ores, trees
  entities/
    player.ts        # movement, physics, collision
    itemDrop.ts      # dropped items that get picked up
  systems/
    mining.ts        # break progress, tool tiers
    building.ts      # placing tiles
    inventory.ts     # hotbar + bag
    crafting.ts      # recipes
    save.ts          # localStorage/IndexedDB save + load
  render/
    camera.ts
    renderer.ts      # tiles, entities, lighting
    particles.ts
  ui/
    hud.ts           # hotbar, depth meter
    menus.ts         # inventory/crafting panel, pause, title
  input.ts           # keyboard + mouse state
tests/
```

Conventions: tile coordinates are integers (`tx`, `ty`); world pixel coordinates are floats (`x`, `y`); `TILE_SIZE = 16` px. Every tunable number (gravity, jump speed, mining speed, world size) lives in `config.ts`.

## World, tiles and generation

The world is a fixed-size grid of 1,000 × 600 tiles (16,000 × 9,600 px), stored in 32 × 32 tile chunks as `Uint8Array`s, and generated from a numeric seed so the same seed always gives the same world.

Tile types (hardness = seconds to break with the starter pickaxe; minimum tier = pickaxe needed):

| ID | Tile | Hardness (s) | Min pickaxe tier | Drops | Where |
| --- | --- | --- | --- | --- | --- |
| 0 | Air | – | – | – | Sky, caves |
| 1 | Grass | 0.3 | 0 | Dirt | Surface top layer |
| 2 | Dirt | 0.3 | 0 | Dirt | Top \~15 tiles |
| 3 | Stone | 0.8 | 0 | Stone | Below dirt |
| 4 | Wood (trunk) | 0.6 | 0 (axe-free) | Wood | Trees on surface |
| 5 | Leaves | 0.1 | 0 | Nothing (10% sapling later) | Trees |
| 6 | Coal ore | 1.0 | 0 | Coal | Depth 20–200 |
| 7 | Copper ore | 1.2 | 1 | Copper ore | Depth 30–250 |
| 8 | Iron ore | 1.6 | 2 | Iron ore | Depth 120–400 |
| 9 | Gold ore | 2.0 | 3 | Gold ore | Depth 250–550 |
| 10 | Deepstone | 2.5 | 2 | Deepstone | Below depth 350 |
| 11 | Bedrock | ∞ | – | – | Bottom 3 rows + world edges |
| 12 | Torch | 0.05 | 0 | Torch | Player-placed only |
| 13 | Planks | 0.4 | 0 | Planks | Player-placed only |

Generation steps, in order:

1. **Surface height**: 1D simplex noise across x, surface around row 120 ± 25 tiles, smooth rolling hills.
2. **Layers**: grass on top, dirt for 10–18 tiles (noise-varied), stone below, deepstone below row 350 with a noisy boundary.
3. **Caves**: 2D simplex noise; carve air where noise > threshold. Caves get more common with depth. Keep the 8 tiles under the surface mostly solid.
4. **Ores**: random-walk veins of 3–8 tiles, placed only in stone/deepstone at their depth ranges.
5. **Trees**: every 6–15 tiles on flat surface grass, trunk 4–7 tall with a leaf blob.
6. **Bedrock**: bottom 3 rows and both side columns.
7. **Spawn point**: middle of the world, on the surface.

## Player, physics, mining and building

The player is a 12 × 28 px axis-aligned box that runs, jumps and falls with tile collision, mines tiles under the cursor within reach, and places tiles from the selected hotbar slot.

**Movement and physics** (all values in `config.ts`, starting points to tune by feel):

- Run speed 180 px/s with quick acceleration and friction (no ice-skating).
- Gravity 1,400 px/s², max fall speed 900 px/s.
- Jump velocity 480 px/s (about 4 tiles high). Holding jump longer gives a higher jump; releasing early cuts it.
- Coyote time 0.1 s and jump buffering 0.1 s so jumps feel forgiving.
- Auto step-up: walking into a 1-tile ledge climbs it automatically.
- Collision: resolve X then Y separately against solid tiles. Never let the player tunnel through tiles at max speed.
- No fall damage and no health in the first version.

**Mining**:

- Hold left mouse on a solid tile within 5 tiles of the player's center to mine it.
- Break time = tile hardness ÷ pickaxe speed multiplier. If pickaxe tier < tile's minimum tier, the tile does not crack and a short "Need better pickaxe" hint appears.
- Show 4 crack stages on the tile; progress resets if the cursor moves to another tile.
- On break: spawn 6–10 colored particles and an item drop that is pulled toward the player within 2 tiles and collected on touch.
- Highlight the tile under the cursor with an outline (white if minable, red if not).

**Building**:

- Right click places the selected block onto an empty tile within reach.
- Placement must be adjacent to an existing solid tile (no floating blocks), and cannot overlap the player.
- Placing consumes 1 item from the stack.

## Inventory, items and crafting

The player has a 10-slot hotbar plus a 30-slot bag; items stack to 999 (tools don't stack), and crafting happens from a simple recipe list with no crafting grid.

**Inventory**:

- Keys 1–0 or mouse wheel select the hotbar slot. `E` or `Tab` opens the full inventory + crafting panel and pauses mining.
- Click to pick up a stack, click again to place or swap; shift-click moves between hotbar and bag.
- Picking up items fills existing stacks first, then the first empty slot. If full, the drop stays on the ground.
- The player always uses the best pickaxe in their inventory; it doesn't need to be selected.

**Pickaxe tiers**:

| Tier | Pickaxe | Speed multiplier | Can mine up to |
| --- | --- | --- | --- |
| 0 | Wooden (start with this) | 1.0× | Coal, stone |
| 1 | Stone | 1.4× | Copper |
| 2 | Copper | 1.9× | Iron, deepstone |
| 3 | Iron | 2.6× | Gold |
| 4 | Gold | 3.5× | Everything |

**Recipes** (crafting needs a Workbench placed within 4 tiles, except the Workbench and Planks themselves; Furnace needed for bars):

| Output | Ingredients | Station |
| --- | --- | --- |
| 4 Planks | 1 Wood | None |
| Workbench | 10 Planks | None |
| 4 Torches | 1 Wood + 1 Coal | None |
| Furnace | 20 Stone | Workbench |
| Stone pickaxe | 15 Stone + 5 Wood | Workbench |
| Copper bar | 3 Copper ore + 1 Coal | Furnace |
| Copper pickaxe | 10 Copper bars + 5 Wood | Workbench |
| Iron bar | 3 Iron ore + 1 Coal | Furnace |
| Iron pickaxe | 10 Iron bars + 5 Wood | Workbench |
| Gold bar | 3 Gold ore + 1 Coal | Furnace |
| Gold pickaxe | 10 Gold bars + 5 Wood | Workbench |

The crafting panel lists every recipe; craftable ones are bright, others greyed out with missing ingredients shown in red. Workbench and Furnace are placeable tiles (add IDs 14 and 15).

Starting inventory: Wooden pickaxe, 10 Torches.

## Rendering, camera, UI and controls

The canvas fills the browser window, draws only the tiles on screen, and uses a simple tile-based light system so caves get dark and torches matter.

**Rendering**:

- Pixel-art look: `imageSmoothingEnabled = false`, integer camera positions, scale factor 2× or 3× chosen by window size.
- Tiles drawn as procedurally generated 16 × 16 textures (base color + a few darker/lighter noise pixels, generated once at startup into an offscreen canvas atlas). Ores = stone texture with colored specks.
- Sky: vertical gradient. Below the surface, a dark dirt-colored background so dug-out areas read as underground.
- **Lighting**: sky light comes straight down from open air; torches emit light radius 8 tiles. Light spreads tile to tile with falloff, recalculated only near changed tiles. Draw a black overlay per tile with alpha = 1 − light.

**Camera**: follows the player smoothly (lerp), clamped to world edges.

**HUD**:

- Hotbar centered at the bottom with item icons and stack counts; selected slot highlighted.
- Depth meter in a corner ("Depth: 87 m", 1 tile = 1 m, 0 at surface level).
- Short toast messages ("+3 Coal", "Need better pickaxe") that fade out after 1.5 s.
- Small FPS counter toggled with `F3`.

**Screens**: title screen (New world with seed field, Continue, Controls), pause menu on `Esc` (Resume, Save, Quit to title).

**Controls**:

| Action | Input |
| --- | --- |
| Move | A / D or ← / → |
| Jump | Space, W or ↑ |
| Mine | Hold left mouse |
| Place block | Right mouse |
| Select hotbar slot | 1–0 or mouse wheel |
| Inventory / crafting | E or Tab |
| Pause | Esc |
| Debug overlay | F3 |

Right-click must not open the browser context menu over the canvas.

## Save/load and performance

One save slot stored in IndexedDB (via the small `idb-keyval` package), auto-saved every 60 s and on pause, and the game must hold 60 FPS on a mid-range laptop.

**Saving**:

- Save = seed + the list of changed chunks only (unchanged chunks regenerate from the seed) + player position + inventory + version number.
- Compress chunk data with simple run-length encoding before storing.
- On load, a version mismatch shows "Save from an older version" and offers a new world instead of crashing.

**Performance budget**:

- Fixed-timestep update at 60 Hz; render with `requestAnimationFrame`.
- Only draw tiles inside the camera view plus a 1-tile margin.
- Cache each chunk's rendered tiles to an offscreen canvas; redraw a chunk only when one of its tiles changes.
- Light updates limited to a region around changed tiles, never the whole world per frame.
- World generation for 1,000 × 600 tiles finishes in under 2 s; show a "Generating world…" screen with progress.

## Build phases with acceptance criteria

Seven phases, each ending in something playable; don't start a phase until the previous one's checks pass.

1. **Skeleton + world**: Vite/TS project, game loop, tile registry, seeded world generation, renderer, free-flying camera (arrow keys).
   - [ ] `npm run dev` opens a page showing hills, dirt/stone layers, caves, ores and trees.
   - [ ] Same seed → identical world; different seed → different world.
   - [ ] Unit tests for generation pass (bedrock at edges, ores only in their depth ranges).
2. **Player + physics**: player box, movement, jumping, collision, camera follow.
   - [ ] Can walk over hills, auto-step 1-tile ledges, jump about 4 tiles, never clip into terrain.
   - [ ] Jump feels responsive (coyote time and buffering work).
3. **Mining + building**: cursor highlight, reach limit, crack stages, item drops, particles, placing blocks.
   - [ ] Can dig a tunnel down to depth 50 and place dirt to build a small wall.
   - [ ] Tiles beyond reach or above the pickaxe tier can't be mined, with a hint shown.
4. **Inventory + crafting**: hotbar, bag, stacking, crafting panel, workbench/furnace, pickaxe tiers.
   - [ ] Starting from a new world, can progress Wooden → Stone → Copper → Iron pickaxe by playing.
   - [ ] Unit tests for stacking and recipe checks pass.
5. **Lighting + polish**: sky light, torches, darkness underground, underground backdrop, toasts, depth meter.
   - [ ] Caves are dark without torches; a placed torch lights about 8 tiles around it.
   - [ ] Steady 60 FPS while digging (check with F3).
6. **Save/load + menus**: title screen, pause menu, auto-save, continue.
   - [ ] Dig a hole, place blocks, reload the page, press Continue: everything is where it was.
7. **Build + ship**: production build, favicon, page title, simple README.
   - [ ] `npm run build` produces a `dist/` folder that runs from any static host (GitHub Pages, Netlify, itch.io HTML upload).

## Out of scope and stretch goals

Claude Code should not build any of these until all seven phases pass; they are listed so the code leaves room for them.

- **Health, enemies and combat**: slimes on the surface at night, cave bats, a sword tier list, fall damage.
- **Day/night cycle** that dims sky light.
- **Background walls** players can mine and place separately from foreground tiles.
- **Liquids**: water and lava pooling in caves (cellular simulation).
- **Chests** for storage and **doors**.
- **Sound**: dig, break, pickup and footstep sound effects via Web Audio.
- **Mobile/touch controls** and gamepad support.
- **Infinite horizontal world** generated in chunks on demand.
- **Multiplayer** (large change: needs a server).
