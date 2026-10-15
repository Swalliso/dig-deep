# Dig Deep – Roadmap after the MVP

All 7 phases of `SPEC.md` are done and live. This is the plan for what comes next. It continues
the same way: one phase at a time, each phase ends playable, and each has acceptance criteria to
check before moving on. Phase numbers continue from SPEC.md.

Each phase is built on its own feature branch off `develop`. Finished phases go to the dev site
first and reach the live site only when a batch is released. See "Branches and deploys" in
`README.md`.

## Where the MVP stands

- 16 tiles, 20 items, 11 recipes and 5 pickaxe tiers.
- One fixed 1000×600 world in a single save slot, with torch lighting and tree felling.
- No health, hazards, goals, sound, storage or way back up.

The loop runs out at the gold pickaxe, around 250–480 m down, with nothing new beyond it.
Digging is never risky, and climbing back up a deep shaft is the hardest thing in the game.

## Direction

- **Hazards before combat.** Danger comes from falls, cave-ins, darkness and lava, not a weapon
  tier list. If creatures come later, they're tied to light.
- **Two modes.** **Sandbox** keeps one persistent world, as now. **Descent** is a run-based
  roguelike mode. Both share the same tiles, items and systems.
- **Four hooks make it Dig Deep rather than a Terraria clone:**
  - **The dark**: darkness hurts. Light keeps you alive; it isn't decoration.
  - **The weight**: loose rock falls and ceilings cave in. Beams make building underground matter.
  - **The descent**: every depth band is a stratum with its own rule, not just a new color.
  - **The way back**: lifts and a portable camp turn your base into a spine down the world.
- In Descent the hooks interlock. Tremors (the weight) are the clock, darkness keeps the pressure
  on minute to minute, strata are the floors, and a lift is the exit.

**Borrowed from Terraria and similar games:** quick stack, crafting from nearby chests,
drag-building, a minimap with fog of war, tooltips, ladders and platforms, a bed as the respawn
point, accessories, bombs and ropes.

**Not borrowed:** bosses, NPC towns, weapon and armor tier lists, sprawling horizontal biomes,
mana or classes.

## Shared foundations

Some phases need to change systems built in earlier phases. Each change is made in the first
phase that needs it, and that phase says so.

| Foundation | Phase | What changes |
| --- | --- | --- |
| Procedural audio (`src/audio/sfx.ts`) | 8 | Sounds synthesized with Web Audio, so no asset files (like the procedural textures). Audio starts on the first click, as browsers require. |
| Tile entities (`src/world/tileEntities.ts`) | 9 | Data stored per tile (chest contents, lift stops, torch timers), keyed by `ty * width + tx` and cleared when the tile changes. `World.onTileChange` becomes a list of listeners. Saved in an optional `tileEntities` field, so no version bump. |
| Save slots | 10 | Several sandbox worlds, plus a run slot and a meta-profile slot later on. The existing save key becomes slot 1, so current saves carry over. |
| PlayerStats (`src/systems/stats.ts`) | 11 | Player stats computed from the base values in config, plus equipment and boons. Replaces direct reads of `REACH`, `STATION_RANGE`, `DROP_PULL_RANGE` and the run/jump constants. |
| Active tile updates (`src/world/tileUpdates.ts`) | 12 | A queue of tiles to recheck, fed by neighbours of changed tiles and worked through with a per-step budget, like the lighting's dirty box. Runs falling blocks, torch burnout and liquids. Never touches the whole world in one frame. |
| Generation profiles | 14 | `generateWorldSteps(world, profile)` takes a `GenProfile` (size, strata, ore table, caves, structures). Today's config values become the Sandbox profile, and Descent floors are smaller profiles. Bump `SAVE_VERSION` when Sandbox generation changes. |

Notes:

- Tile ids are stored as `Uint8`, so there's room for 240 more tiles.
- `PlayerControls.climb` already exists for debug fly mode, and ladders can reuse it.
- Every phase adds debug shortcuts in `src/debug.ts` for anything slow to reach by playing.

## Arc 1 – Feel and quality of life (no new danger)

### Phase 8: Sound and juice

- **Sound**:
  - Dig ticks pitched by hardness.
  - A break sound per material: a thud for dirt, a crack for stone, a clink for ore.
  - A pickup blip that climbs in pitch during quick runs of pickups.
  - Sounds for placing, crafting, footsteps (by surface tile), jumping, landing and clicking UI.
- **Juice**:
  - On break, a small screen shake and a 1-frame flash, both scaled by hardness.
  - Dust puffs when the player lands.
  - Ores sparkle faintly wherever they're lit.
- **Settings screen**, reached from the title and pause menus:
  - Master and SFX volume, screen shake on/off, pixel scale (auto, 2× or 3×), FPS counter.
  - Stored in localStorage, as a per-device preference.

- [ ] Every action listed has a sound. Volume 0 is silent, and settings survive a reload.
- [ ] Still 60 FPS while digging fast with sound on.

### Phase 9: Storage and crafting QoL

- **Chests**:
  - A chest tile holds 20 slots. Right-click opens it next to the inventory.
  - Buttons: Loot all, Deposit all, and Quick stack (moves only items the chest already holds).
  - A hotkey quick-stacks into every chest within station range.
- **Crafting uses items in nearby chests** within station range.
- **Tooltips** on slots and recipes: name, what it does, which station it needs, what it places.
- **Crafting panel**:
  - Click crafts 1 and shift-click crafts 10.
  - A "craftable only" filter.
  - Recipes grouped into Blocks, Tools, Materials and Stations.
- **Q** drops the selected stack, and the inventory gets a trash slot.
- **Drag-building**: hold right mouse to keep placing as you sweep. Middle-click picks a block
  onto the hotbar.
- Debug: the materials kit includes chests.

- [ ] Items in a chest 3 tiles away count for crafting. Quick stack moves only matching items.
- [ ] Chest contents survive a reload. Breaking a chest drops its contents.

### Phase 10: Traversal, map and worlds

- **Ladder** (planks): climbable and non-solid. W/S climb, and jump lets go.
- **Platform** (planks): one-way. Jump up through it, and press S + jump to drop through.
- **Door**: 1×2, right-click to open or close. The first multi-tile object, and the pattern for
  lifts and the camp later.
- **Map**:
  - M opens a full-screen map with pan and zoom, and a corner minimap can be toggled.
  - Fog of war: a tile counts as explored once it's been lit or come within a few tiles of the
    player. Explored tiles are a bitset per chunk, saved RLE-compressed.
  - Markers for the player, the spawn point or bed, and chests.
- **World list** on the title screen: several sandbox worlds, each showing name, seed and when
  it was last played. Deleting one asks for confirmation.

- [ ] Can climb a 100 m ladder shaft and drop through platforms.
- [ ] The map shows only explored areas, and still does after a reload.
- [ ] Two worlds can be created and played independently.

## Arc 2 – Danger (hazards first)

### Phase 11: Health, falls and respawn

- Builds the PlayerStats foundation.
- **Health**: 10 HP shown as 5 hearts, a red flash when hurt, and slow regeneration after 5 s
  without damage.
- **Fall damage** only beyond about 12 tiles (tunable), so normal jumps and drops never hurt.
- **Bed** sets the respawn point.
- **Death**:
  - The bag contents drop in a satchel where you died, and the hotbar stays with you.
  - You respawn at the bed, or at spawn if there isn't one.
  - Going back for the satchel becomes a small goal.
- **World option when creating a world**: *Cozy* (no damage at all) or *Normal*. It's stored
  in the save, so the Sandbox can stay relaxing.
- Debug: H toggles god mode and heals.

- [ ] A 20-tile fall hurts and a 10-tile fall doesn't.
- [ ] On death, the satchel holds the bag and you respawn at the bed.
- [ ] A Cozy world never takes damage.

### Phase 12: Cave-ins and supports

- Builds the active tile updates foundation.
- **Loose tiles**: gravel, in pockets in the stone strata and often in cave ceilings. Sand comes
  later. Once nothing holds a loose tile up:
  - It shakes for about 0.4 s with dust as a warning, then falls as an entity and lands as a
    tile again.
  - Landing on the player deals damage based on how far it fell.
  - Collapses chain on their own.
- **Supports**:
  - A *beam* (planks) is a vertical post you can walk through. It holds up the tile above it.
  - A *crossbeam* holds up the row above it.
  - Platforms also count as support.
- Stretch, also used later by Descent tremors: ceilings of "unstable rock" collapse when the
  unsupported span gets wider than N tiles.

- [ ] Mining under gravel collapses it after a visible shake. A beam underneath stops it.
- [ ] Falling gravel hurts, and big collapses never stall the game.

### Phase 13: The dark

- **Dread meter**:
  - Rises while the light-map level at the player's tile is below a threshold. The player glow
    doesn't count, since it's only drawn.
  - Drains quickly in light.
  - When full: a vignette, a heartbeat, and 1 HP lost every 2 s.
  - Health only regenerates in light. Cozy worlds have no dread.
- **Carried light**:
  - The light map gets a moving light source that relights when the player moves to another
    tile.
  - A **lantern** (iron + torch) lights a 6-tile radius while held. A helmet version comes in
    Phase 15.
- **Flare**: thrown, sticks where it lands, and lights a large area for 30 s, for scouting.
- **Natural light**: glowing mushrooms and crystals as new tiles, placed once strata arrive, so
  not every cave is pitch black.

- [ ] Standing in an unlit cave fills dread and eventually hurts. A torch or lantern stops it.
- [ ] The incremental-vs-full lighting test still passes with moving lights.

## Arc 3 – The deep (strata, gear, structures, lifts)

### Phase 14: Strata

- Builds the generation profiles foundation, redoes the ore depth bands per stratum, and bumps
  `SAVE_VERSION`.
- Strata at Sandbox depths (the world bottom is about 477 m):

| Stratum | Depth | Ores | Rule |
| --- | --- | --- | --- |
| Topsoil | 0–15 m | – | Safe |
| Stone Caverns | 15–110 m | Coal, copper | Gravel pockets; cave-ins start here |
| Fungal Hollows | 110–230 m | Iron | Glowshrooms are the main light; damp air shrinks torch radius |
| Geode Depths | 230–350 m (deepstone) | Gold, gems | Huge glowing crystal caverns; floatstone lowers gravity in open caverns |
| Magma Layer | 350 m–bedrock | Emberite (tier 5) | Heat builds away from cooled areas; lava pools that don't flow (they hurt and give light) |

- Each stratum gets its own backdrop tint, and a banner when you enter it ("Fungal Hollows — 110 m").
  F3 shows the current stratum.
- A tier 5 pickaxe (Emberite), so gold no longer mines everything.
- Optional capstone: a sealed **Heart of the Deep** chamber above the bedrock. Opening it is the
  Sandbox's ending.
- Debug: T teleports to the top of the next stratum.

- [ ] Each stratum looks and plays differently at its depth, and the same seed gives the same
  world.
- [ ] Generation stays under 2 s, and the generation tests cover strata bands and ore placement.

### Phase 15: Gear and tools

- **Accessories**: 4 accessory slots in the inventory panel, wired into PlayerStats.

| Accessory | Effect |
| --- | --- |
| Miner's helmet | Carried light, radius 4 |
| Toolbelt | Crafting station range +4 |
| Magnet charm | Pickup range +3 |
| Long-handled grip | Reach +1.5 |
| Spring boots | Higher jump |
| Padded boots | Safe fall height +8 |
| Heat ward | Slows the Magma Layer's heat meter |
| Climbing claws | Wall slide and cling |

- **Tools**:
  - **Bomb**: a 3×3 blast. It follows pickaxe tier rules, never breaks bedrock, and hurts you.
  - **Rope coil**: throw it down a shaft and it unrolls a 20-tile rope ladder.
  - **Drill**: tier 5+. Mines continuously and fast, burning coal as fuel.
- Gems from the Geode Depths go into accessory recipes.

- [ ] Every accessory's effect shows in play and in F3. Bombs respect pickaxe tier.

### Phase 16: Structures and loot

- Seeded structures placed per stratum:
  - **Abandoned mineshafts**: plank corridors with beams, ladders and a chest.
  - **Lost camps**: a bed, a dead torch, a chest and a journal page.
  - **Geodes**: a crystal shell around a core of gems.
  - **Sealed vaults**: walls that need a higher pickaxe tier, with the best loot inside.
- Loot tables per stratum, rolled with the seeded RNG.
- Journal pages hint at a light story, e.g. *"the last expedition went quiet below 400 m"*.
- Debug: a key that jumps to the nearest structure.

- [ ] Each stratum has 3 or more structures, and loot is the same for the same seed.
- [ ] Structures and their chests survive saving and reloading.

### Phase 17: Lifts and the camp

- **Lifts**:
  - **Lift rail** (iron) is placed as a vertical column, with **lift stops** beside it.
  - A **lift cage** rides the rail. Right-click a stop to call the cage or to pick a stop to
    ride to.
  - While riding, the player is attached to the cage, so no moving-platform physics are needed.
  - About 20 tiles/s. The rail column becomes the spine of your base.
- **Camp kit**: one placeable 2×2 object that counts as a workbench, a furnace and a bed. Break
  it to pack it up and set it up again deeper down.
- **Homing flare** (consumable): teleports you to your camp.
- Lift stops and the camp show on the map.

- [ ] Can build a 300 m lift and ride it both ways.
- [ ] The camp crafts like both stations and sets the respawn point.

## Arc 4 – Descent mode (roguelike)

### How a run works

- **Modes and kit**:
  - The title screen offers **Sandbox** and **Descent**, each with its own saves.
  - A run starts with a stone pickaxe, 10 torches, 1 lantern, and a pick of 1 of 3 starting
    boons.
- **Floors**: a run is 5 floors, one per stratum: Stone Caverns → Fungal Hollows → Geode
  Depths → Magma Layer → The Heart.
  - Each floor is its own small world of about 200 × 320 tiles (around 0.2 s to generate),
    built from `runSeed + floor` with that stratum's profile.
  - You arrive by lift at the top, and the exit lift sits lower down.
  - Aim for 6–9 minutes per floor, so 35–45 minutes per run.
- **Floor objective**: one per floor, shown on arrival. Completing it powers the exit lift.
  - Reach the exit.
  - Deliver a quota, e.g. 30 copper + 10 iron to the lift.
  - Recover a relic from a sealed vault.
  - Light 3 marked beacons.
- **Tremors are the clock**:
  - Every ~90 s the floor shakes.
  - They escalate: dust and shaking → loose rock falls → unstable ceilings near the player
    collapse → after about 10 minutes the floor is collapsing.
  - You can keep looting after finishing the objective, but the floor keeps getting worse.
- **Floor mutators**: 0–2 per floor, chosen by the run RNG:
  - *Pitch black*: no natural light.
  - *Damp*: torches gutter out after 3 minutes.
  - *Rich veins*.
  - *Unstable*: tremors twice as often.
  - *Low gravity*.
- **Carried between floors**: inventory, HP and boons. Pickaxe progress stays the spine of a run,
  since each floor's ore crafts the pickaxe the next floor needs.
- **Boons**: after each floor, pick 1 of 3. They come in common, rare and cursed (risk for
  reward). Examples:

| Mining | Light | Movement | Fortune | Safety |
| --- | --- | --- | --- | --- |
| Vein Miner: breaking ore also breaks connected ore (up to 8) | Bright Torches: +3 radius | Double jump | Prospector: ores within 6 tiles glint through rock | Hard Hat: −50% falling-rock damage |
| Tunnel Bore: every 5th break also breaks the next tile | Steady Nerves: dread rises 40% slower | Feather Fall | Lucky Strike: 10% double drops | Second Wind: survive 1 lethal hit per floor |
| Brittle Earth: dirt and stone break instantly | Glowing Trail: you leave dim light behind | Wall Cling | Pack Mule: +10 bag slots | Shoring: beams cost nothing |

  Cursed example: *Greed*: +50% ore, but tremors start 30% sooner.

- **Death ends the run**. A summary shows depth, floors cleared, ore mined, boons taken and time.
  Quitting mid-run keeps the run save so it can be resumed.
- **Meta progression**:
  - **Core shards** are earned from floors cleared, relics and depth, and some are kept on death.
  - They're spent at **Base Camp**, a title-menu screen with 3 unlock tracks:
    - **Kit**: better starting items.
    - **Pool**: new boons, objectives and mutators. More variety, not raw power.
    - **Talents**: small permanent stat boosts, with caps.
- **Seeds**: floors and boon offers come from the run seed, so a seed replays exactly. **Daily
  Descent** uses a seed made from the date. It's local only, with no server.

### Phase 18: Run skeleton

- Mode select on the title screen, and the floor profiles.
- The arrival lift and exit lift, with "reach the exit" as the only objective for now.
- Moving between floors, the run summary on death, and a save slot for resuming a run.
- Debug: N skips the current floor.

- [ ] A run can be played through all 5 floors to the end.
- [ ] Death shows the summary, and quitting mid-floor resumes in the same place.

### Phase 19: Boons

- The pick-1-of-3 screen, and about 20 boons wired into PlayerStats and existing systems.
- Rarities, and offers that are deterministic per run seed.
- Debug: R rerolls the offer.

- [ ] Every boon has a noticeable effect, and the same seed gives the same offers.

### Phase 20: Objectives, tremors and mutators

- The objective pool, escalating tremors and floor mutators.
- An objective HUD and a tremor warning.

- [ ] Every objective type can be completed.
- [ ] Tremors escalate on schedule, and their collapses follow the cave-in rules.

### Phase 21: Meta progression and dailies

- Core shards, the Base Camp unlock screen, a persistent profile save, run history and Daily
  Descent.

- [ ] Unlocks carry across runs and reloads, and two runs on the same daily seed match.

## Arc 5 – Later (both modes)

- **Flowing liquids**: water and lava as a cellular simulation running on the active-tile queue.
  This brings flooded floors, an air meter and lava that really flows. It's the biggest
  technical item, which is why the strata use still lava first.
- **Creatures of the dark**, with no weapons:
  - "Gloomlings" live only in unlit tiles and flee from light.
  - Burrowers chew through tunnels.
  - The player's tools against them are torches and flares.
- **Extras**:
  - Procedural ambient music per stratum.
  - A day/night cycle on the surface.
  - Background walls.
  - Gamepad and touch controls.
  - Horizontal surface biomes, such as desert sand and snow.

## Order

The recommended path is to work through the phases in number order. For a rough version of
Descent sooner, Phase 18 strictly needs only Phase 11 (health and PlayerStats) and Phase 14
(generation profiles). Everything in between makes Descent better but isn't required.
