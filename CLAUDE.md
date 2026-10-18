# Dig Deep — project notes for Claude

Side-view 2D mining/building sandbox that runs in the browser. The original design lives in
`SPEC.md` (phases 1–7, all done); what comes next is planned in `ROADMAP.md` (phases 8+). This
file holds only what every session needs; topic details live in `.claude/rules/` (see the end).

## How we work

- The game is built in phases: 1–7 at the end of `SPEC.md` (done), 8+ in `ROADMAP.md`.
  Implement **only** the phase the user asks for. Don't build later-phase features early, even
  small ones. ROADMAP.md's "Shared foundations" table says which phase builds each shared system.
- Don't refactor earlier phases unless the current phase needs it; say so when you do.
- At the end of a phase: `npm test`, `npm run build`, run `npm run dev`, then give the user
  exact steps to check that phase's acceptance criteria and stop.
- Each phase is built on its own branch, `feature/phase-N-short-name`, made from `develop`.
  The user commits on that branch after every working phase.
- **Where things get written down**: what a phase built goes in its ROADMAP.md "As built" notes
  and its PR description, not here. Keep this file to rules every session needs; put details
  that only matter when touching certain files in the matching `.claude/rules/` file (or a new
  one with a `paths:` list), so they load only when those files are opened.
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
  hotfix pushes; its runner is much slower than a dev PC, so keep each test well under Vitest's
  5 s timeout. **Only push, open PRs or merge when the user asks**, and never touch `main`
  without being asked for a release or hotfix. Commits in this repo use the GitHub no-reply
  address (set in the local git config).
- **Dev-site builds** (`--mode develop`, see `src/channel.ts`) save under `dig-deep-dev:` keys,
  title the page "Dig Deep (dev)" and show a DEV BUILD tag on the title screen. Both sites share
  the swalliso.github.io origin, so every IndexedDB/localStorage key must go through
  `storageKey()`; the live keys (`dig-deep:save`) must never change.
- **Debug mode**: `?debug` in the URL turns on testing shortcuts (`src/debug.ts`; the full list is
  in `.claude/rules/debug.md` and README.md). Each phase adds shortcuts for anything slow to reach
  and mentions them in its test steps.

## Changes from SPEC.md (agreed with the user)

These override the spec. Don't revert them. Details are in the rules file named after each.

- Mining damage persists per tile and heals after 3 s without a hit (`player-and-input.md`).
- Trees fall: breaking a trunk also breaks the trunk above it and the canopy (wood drops, leaves
  burst); the stump below the cut stays.
- Left mouse uses what's held (place a held block, otherwise dig); right-click only interacts
  (`player-and-input.md`).
- Jump corner correction, and S drops through platforms (`player-and-input.md`).
- Light: a faint player glow that's only drawn; carried light holds dread off, only established
  light heals (`lighting.md`).
- Diagonal light, "Height: N m" above the surface level, and the floating "Need better pickaxe"
  hint were reviewed and kept.
- Saving soon after changes: besides the 60 s autosave and save-on-pause, anything that changed
  is saved within `SAVE_CHANGES_AFTER` (2 s), because browsers drop IndexedDB writes made while a
  page unloads. Deleting a world asks for a second click.

## Stack

TypeScript (`strict`), Vite (`npm run dev`, `npm run build`, `npm run build:dev`), plain HTML5
Canvas 2D with no game engine, `simplex-noise`, Vitest (`npm test`, files in `tests/`),
`idb-keyval` for IndexedDB saves, and procedural pixel art and sound generated in code (no
external assets).

## Folder layout

```
src/main.ts      boot, screens (title → loading → playing ⇄ paused), world slots, loop, saving
src/game.ts      one play session: world, player, systems, HUD
src/config.ts    every tunable number
src/channel.ts   live vs dev-site build, storageKey()
src/input.ts     the action table (every key binding), keyboard + mouse state
src/debug.ts     ?debug testing shortcuts
src/world/       tiles, chunked storage, generation and strata, lighting, supports, heat, plants,
                 tile entities, doors, beds, the camp, lift rails and stops, explored map
src/entities/    player physics, item drops, flares, bombs
src/systems/     items, inventory, mining, building, crafting, chests, saves and backups, health,
                 death, dread, heat, cave-ins, lifts, goal and map pins, settings, clock, stats
                 (and the gear they come from), tools (bomb blasts, rope coils, drill fuel), hints
src/render/      camera, textures, renderer, parallax, particles, juice, map image
src/ui/          HUD, vitals, menus and panels, the lift panel, map, controls and key hints, guidance
src/audio/sfx.ts every sound effect and stratum ambience (Web Audio)
tests/           Vitest unit tests
```

Item ids are string keys of `ITEMS` (`'dirt'`, `'copper_ore'`, ...); tiles name the item they
drop.

## Conventions

- **Coordinates**: tile coords are integers named `tx`, `ty`. World pixel coords are floats named
  `x`, `y`. `TILE_SIZE = 16`. `ty` grows downward (row 0 is the top of the sky). Depth in metres
  is `ty - SURFACE_LEVEL` (120).
- **Tunables**: every tunable number lives in `src/config.ts`. Per-tile data (hardness, min tier,
  color, drop) lives in the tile registry (`world/tiles.ts`). Tile ids are `Uint8`: append new
  tiles and keep existing ids stable.
- **World**: 1000 x 600 tiles, stored as 32 x 32 chunks. Out-of-bounds reads return Bedrock. The
  same seed must always produce the identical world, so all randomness in generation goes through
  the seeded RNG (`util/rng.ts`). Never use `Math.random()` in generation. New generation goes in
  a new generation profile; released profiles never change (`world-gen.md`).
- **Loop**: fixed-timestep `update(dt)` at 60 Hz; `render()` once per `requestAnimationFrame`,
  interpolating moving things between the last two steps. Keyboard edge presses (`wasPressed`)
  are cleared after each update step.
- **Pausing**: the inventory panel, the full map, the lift panel, the pause menu and losing
  window focus (or hiding the tab) all pause the world. `Game.update` still handles input for the HUD, the panel
  and the map every step, but only calls `simulate()` while neither is open, and main.ts doesn't
  call `update` at all while the pause menu is up. Everything timed in the world (physics, drops,
  mining damage, hazards, plant growth, ambience events) takes its time from the simulation step
  and `Game.clock` (`systems/clock.ts`), never from `Date.now()` or `performance.now()`. Toasts
  and UI animations run on real time. Focus loss needs an explicit resume, except in debug mode.
- **Input**: game code reads keys only through actions from the table in `input.ts`, and any text
  that names a key is built with the helpers in `ui/controls.ts` (`player-and-input.md`).
- **Saves**: bump `SAVE_VERSION` in `systems/save.ts` whenever world generation, tile ids,
  chunk/world size or the save format change. New saved state goes in `savedState()` (a test
  enforces it), as optional fields that need no version bump. Breaking old worlds is acceptable
  when keeping them would hold a feature back (`saves.md`).
- **Performance**: never do per-frame work over the whole world, give anything that can pile up a
  per-step budget, and keep world generation around 2 s. Frame rate isn't a gate for a phase;
  performance passes come later, measured on the reference device in README.md.
- Keep modules small and focused. Prefer plain functions and data over class hierarchies.

## Topic rules (`.claude/rules/`)

Each file loads automatically when Claude opens one of the files listed in its `paths:`.

| File | Covers |
| --- | --- |
| `debug.md` | every debug shortcut, `window.digDeep` |
| `saves.md` | save format, optional fields, backups, world slots |
| `world-gen.md` | depth, generation profiles, strata and their rules |
| `lighting.md` | light map, moving lights, the light rules, player glow |
| `player-and-input.md` | physics, jump and drop rules, mining damage, mouse, actions, typing |
| `rendering-and-audio.md` | drawing rules, textures, parallax, ambience, the og image |
