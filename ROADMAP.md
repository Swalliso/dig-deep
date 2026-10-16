# Dig Deep – Roadmap after the MVP

All 7 phases of `SPEC.md` are done and live. Phases 8–10 are implemented on `develop`;
**Arc 2, starting with Phase 11a, is the current focus**. This plan continues the same way: one
phase at a time, each phase ends playable, and each has acceptance criteria to check before
moving on. Phase numbers continue from SPEC.md. Earlier phase checklists remain as validation
targets; release status is separate from implementation status.

Each phase is built on its own feature branch off `develop`. Finished phases go to the dev site
first and reach the live site only when a batch is released. See "Branches and deploys" in
`README.md`.

## Where the game stands after Phase 10

- Five pickaxe tiers, procedural sound, mining feedback, torch lighting and tree felling.
- Chests, crafting from nearby storage, tooltips and drag-building.
- Ladders, platforms, doors, an explored map and minimap, and multiple named sandbox worlds.
- Worlds are each 1000×600 tiles. No health, hazards or explicit progression goals yet.

The loop runs out at the gold pickaxe, around 250–480 m down, with nothing new beyond it.
Ladders provide a way back up; deeper expeditions still need stronger reasons to prepare,
explore side passages, build safe routes and return home.

## Direction

- **Hazards before combat.** Danger comes from falls, cave-ins, darkness and lava, not a weapon
  tier list. If creatures come later, they're tied to light.
- **Two modes.** **Sandbox** keeps persistent worlds, as now. **Descent** is a run-based
  roguelike mode. Both share the same tiles, items and systems.
- **Four hooks make it Dig Deep rather than a Terraria clone:**
  - **The dark**: darkness hurts. Light keeps you alive; it isn't decoration.
  - **The weight**: loose rock falls and ceilings cave in. Beams make building underground matter.
  - **The descent**: every depth band is a stratum with its own rule, not just a new color.
  - **The way back**: lifts and a portable camp turn your base into a spine down the world.
- In Descent the hooks interlock. Tremors (the weight) are the clock, darkness keeps the pressure
  on minute to minute, strata are the floors, and a lift is the exit.
- **The expedition loop**: prepare → explore → take a calculated risk → gain something useful
  → return and improve the next trip. Each new hazard needs a readable cue, an affordable
  countermeasure, a chance to react and a reward worth the effort.
- **Keep complexity useful.** Introduce one major rule at a time. Protected routes and bases
  should visibly repay the effort of building them. Sandbox goals stay optional; expedition
  deadlines belong to Descent. Add upkeep or extra resource meters only when a simpler
  interaction cannot do the job.

**Borrowed from Terraria and similar games:** quick stack, crafting from nearby chests,
drag-building, a minimap with fog of war, tooltips, ladders and platforms, a bed as the respawn
point, accessories, bombs and ropes.

**Not borrowed:** bosses, NPC towns, weapon and armor tier lists, sprawling horizontal biomes,
mana or classes.

## Playability checks for every new phase

Mechanical acceptance checks below are necessary, and each phase also gets a fresh-world
playtest. Keep a short note of the seed, browser/device and findings in a "Playtest notes"
section of the phase's PR description, so the notes live next to the change they describe.

- A new player can find a useful next goal and understand the new rule through play. Optional
  hints can be dismissed and reopened.
- The new danger has a recognizable warning and an available countermeasure before it can
  cause a serious loss. Preparation makes the same encounter visibly safer.
- A mistake has an understandable cause and a practical recovery route. Note time spent
  exploring/mining versus travelling, sorting and recovering; adjust friction that crowds out
  useful progress.
- Important warnings remain readable with sound muted, shake disabled and reduced flashes on.
  Use text, shape or motion as well as color.
- Check the feature with the existing systems together: mining, lighting, storage, map and
  autosave. Keep the 60 FPS target on a documented reference browser/device (recorded in
  README.md's Development section), including a busy underground scene. Any missed target gets a
  concrete follow-up before adding more load.

## Shared foundations

Some phases need to change systems built in earlier phases. Each change is made in the first
phase that needs it, and that phase says so.

| Foundation | Phase | What changes |
| --- | --- | --- |
| Procedural audio (`src/audio/sfx.ts`) | 8 | Sounds synthesized with Web Audio, so no asset files (like the procedural textures). Audio starts on the first click, as browsers require. |
| Tile entities (`src/world/tileEntities.ts`) | 9 | Data stored per tile (chest contents, lift stops, torch timers), keyed by `ty * width + tx` and cleared when the tile changes. `World.onTileChange` becomes a list of listeners. Saved in an optional `tileEntities` field, so no version bump. |
| Save slots | 10 | Several sandbox worlds, plus a run slot and a meta-profile slot later on. The existing save key becomes slot 1, so current saves carry over. |
| Session clock and saved state | 11a | Define when simulation pauses, then use that clock for damage, regeneration and later hazards (`Game.time` already counts play time for the ore glints; build on it). Save per-world state such as difficulty now, and health, respawn, satchels and fall progress in 11b; include their changes in autosave detection. Later phases extend this contract with their own state. |
| Input actions (`src/input.ts`) | 11a | Logical actions (move left, jump, climb, map, quick stack…) bound to keys in one table, instead of key codes spread through `game.ts`. The F3 help, the Controls screen, tooltips and hints read their key names from it, so the remapping screen in the companion work only edits the table. |
| PlayerStats (`src/systems/stats.ts`) | 11b | Player stats computed from the base values in config, plus equipment and boons. Replaces direct reads of `REACH`, `STATION_RANGE`, `DROP_PULL_RANGE` and the run/jump constants. 11b uses it for max health and safe fall height. |
| Active tile updates (`src/world/tileUpdates.ts`) | 12 | A queue of tiles to recheck, fed by neighbours of changed tiles and worked through with a per-step budget, like the lighting's dirty box. Runs falling blocks, torch burnout and liquids. Never touches the whole world in one frame. |
| Generation profiles | 12, extended in 14 | `generateWorldSteps(world, profile)` takes a `GenProfile` (size, layers, ore table, caves, loose-rock pockets, later strata and structures). Today's generation becomes the frozen **classic** profile; Phase 12 adds gravel in a new profile, Phase 14 adds strata, and Descent floors are smaller profiles. |
| World compatibility | 12, reviewed at 14 and 16 | Saves regenerate unchanged chunks from their seed, so each world records the generation profile (name and version) it was created with and keeps generating with it; existing worlds are **classic**. New generation features appear in new worlds. Optional later: an explicit "upgrade world" that regenerates only chunks that are both unchanged and never explored (the Phase 10 explored map knows which), so nothing the player has seen changes. Never silently reinterpret an old world with new generation. Bump `SAVE_VERSION` only for format changes old code can't read. Export/import backups arrive with Phase 11a. |
| Run rules and random streams | 18 | Record the seed, rules/generation version and eligible content pools. Derive separate generation, loot and boon streams from the seed and stable floor identifiers; keep cosmetics independent. Persist the state needed to resume without rerolling content. |

Notes:

- Tile ids are stored as `Uint8`; keep existing ids stable when adding new tiles.
- `PlayerControls.climb` already powers ladders and debug fly mode (W/S or ↑/↓; jump flies up).
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

- **Ladder** (planks): climbable and non-solid. W/S climb, Space hops off, and S + Space lets
  go. The top of a ladder is a floor you can walk across, and grabbing one lines you up with it.
- **Platform** (planks): one-way. Jump up through it, and press S + jump to drop through.
- **Door**: 1×2, right-click to open or close. The first multi-tile object, and the pattern for
  lifts and the camp later.
- **Map**:
  - M opens a full-screen map with pan and zoom, and a corner minimap can be toggled.
  - Fog of war: a tile counts as explored once it's been lit or come within a few tiles of the
    player. Explored tiles are kept per chunk (one byte per tile), saved RLE-compressed.
  - Markers for the player, the spawn point or bed, and chests.
- **World list** on the title screen: several sandbox worlds, each showing name, seed and when
  it was last played. Deleting one asks for confirmation.

- [ ] Can climb a 100 m ladder shaft and drop through platforms.
- [ ] The map shows only explored areas, and still does after a reload.
- [ ] Two worlds can be created and played independently.

## Arc 2 – Danger (hazards first)

### Companion work: guidance and polish

The table is planned companion work, with target windows for small slices; it does not require
every row to ship with Phase 11a or 11b. Finish recovery, pause and save requirements first. Larger
polish items such as remapping, UI scaling and animation may move without blocking a phase.
Readable hazard cues and persistence are required when their feature ships, and crafting
navigation must precede a large recipe expansion. These additions do not renumber phases.

| Enhancement | Target | Scope and acceptance |
| --- | --- | --- |
| Optional next goal | 11–12 | Pin one recipe, show ingredient counts and the required station, and suggest the next pickaxe upgrade. Counts include nearby crafting storage. Add brief ore-depth guidance; no separate quest system. The pin survives reload and can be cleared. |
| Introduction prompts | 11–13 | Short, dismissible hints for the first crafting station, bed, dangerous fall, unstable ceiling and dark cave. Teach each hazard in a forgiving encounter; hints can be reopened from help. |
| Player map pins | 12 | A few named pins for veins, alternate routes and places to revisit. Save them per world, respect fog of war, and allow one selected pin to show direction and distance without forcing the map open. |
| Action feedback | 11–13 | Visible mining swing, a held lantern when it arrives, hovered tile names, and specific tier hints such as "Requires copper pickaxe". Invalid building explains the reason; support previews arrive in Phase 12. |
| Accessible controls and display | 11–13 | Remappable actions (a screen over 11a's action table) with reset-to-default and conflict feedback; independent UI/text scaling; reduced-flash setting (in 11b); visual equivalents for sound warnings. Persist preferences per device and update displayed key hints. Introduce visual hazard cues with each hazard. |
| Crafting grows with content | By 15 | Scrollable categories or tabs, search and a readable minimum text size as recipes grow. Keep the pinned recipe and missing ingredients easy to find on smaller desktop windows. |

### Phase 11a: Session foundations and save safety

Phase 11 is split in two so each half stays small enough to test by hand: 11a makes pausing
and saving trustworthy, then 11b adds the first way to lose items. Both keep the number 11.

- Builds the session clock, saved-state and input-action foundations.
- **Pause policy**: the inventory/crafting panel, full map and pause menu freeze simulation
  (today the world keeps running behind the panel and the map). Losing window focus or hiding
  the tab pauses too, and returning focus requires an explicit resume. UI interactions still
  work while panels are open. Damage, regeneration and all later hazard/run timers use the
  same simulation clock.
- **Save reliability before introducing item loss**:
  - Fix Save & Quit so a failed write keeps the live session available for retry (today it
    returns to the title either way).
  - Preserve cursor-held items even when the inventory is full; saving never discards
    overflow (today the save drops whatever doesn't fit).
  - Add export/import backups with validation and an explicit choice before replacing a world.
    Export can use the current live session after a save failure. An exported world keeps its
    generation profile, so it stays playable after generation changes.
  - Every saved change, including ones made while standing still, triggers the 2 s autosave.
- **Input actions**: move the key bindings into one action table and read every key hint
  (F3, Controls, tooltips, prompts) from it. No remapping screen yet.
- **Testing support**: in `?debug` mode only, expose the running game to the browser console
  (for scripted preview checks) and don't auto-pause on focus loss, so checks still run in a
  hidden preview pane. Vitest ignores `.claude/worktrees`, so `npm test` runs this checkout's
  tests only.

- [ ] Panel, map, pause and focus loss freeze simulation consistently, including timed effects.
- [ ] A failed Save & Quit retains the session. Cursor items with a full inventory survive a
      save, and an exported then imported world keeps every item and its map.
- [ ] Every on-screen key hint comes from the action table.

### Phase 11b: Health, falls and respawn

- Builds the PlayerStats foundation.
- **Health**: 10 HP shown as 5 hearts, a red flash when hurt, and slow regeneration after 5 s
  without damage.
- **Damage feedback**: brief hurt protection prevents simultaneous impacts from removing all
  reaction time. Use one consistent rule across hazards, including Phase 12's falling-block
  pileups, and show the protection state without relying on flashes alone. Phase 11b includes
  a persisted reduced-flash setting (covering the existing break flash and ore glints too) and
  a readable non-flashing damage cue.
- **Fall damage** only beyond about 12 tiles (tunable), so normal jumps and drops never hurt.
- **Ladders and falls**: grabbing a ladder (W/S while falling past one) ends the fall with no
  damage. Walking off a ledge into a ladder column catches you on the ladder; jumping or
  dropping in on purpose doesn't. The first fall past a ladder shows a "Hold W or S to grab"
  hint. (Phase 10 testing walked straight into a shaft from the side; with fall damage that
  would be a long, unfair drop.)
- **Bed** sets the respawn point and gives visible confirmation. Mark the active bed on the map.
  It's two tiles wide, reusing the door's two-tile pattern.
- **Death**:
  - The bag contents drop in a satchel where you died. The hotbar stays with you, and so does
    every pickaxe wherever it is (the best carried pickaxe always mines, so losing it would
    strand the player). The death screen says what was kept.
  - Every satchel gets a persistent map marker. Further deaths leave earlier satchels intact;
    collecting with a full inventory leaves the remaining items in the satchel.
  - Respawn at the bed if it has safe standing space. A destroyed or blocked bed uses a safe
    fallback near spawn. Brief protection prevents immediate repeated hits after respawn.
  - Show the cause of death and point toward the satchel. Going back for it becomes a small
    goal, with no automatic expiry while the player prepares.
- **World option**: *Cozy* disables damage, dread and destructive cave-ins; *Normal* enables
  them. The New world screen asks, defaulting to Normal; worlds from before Phase 11b become
  Cozy, so nobody's relaxing world turns dangerous. Sandbox players can change it from the
  pause menu without regenerating the world; Descent uses fixed run rules. Later hazards must
  state how Cozy affects them.
- **Saved state**: HP, damage/regeneration timers, difficulty, bed, every satchel and fall
  progress. Reloading halfway down a shaft must not reset the fall's consequences.
- Debug: H toggles god mode and heals.

- [ ] A 20-tile fall hurts and a 10-tile fall doesn't. Grabbing a ladder mid-fall cancels the
      damage, and walking into a ladder shaft from the side catches you.
- [ ] On death, the satchel holds the bag, every pickaxe stays with you, and you respawn at the bed.
- [ ] Two deaths leave two marked, recoverable satchels across a reload. A full bag never loses loot.
- [ ] A blocked or destroyed bed gives a safe fallback; respawn cannot immediately chain into death.
- [ ] Rapid repeated hits respect hurt protection and the reduced-flash setting. Extend this
      check to falling-block pileups in Phase 12.
- [ ] HP, world options and fall progress survive reload.
- [ ] A Cozy world never takes damage, and its terrain stays protected from destructive cave-ins
      when Phase 12 arrives. Existing worlds receive the documented default.

### Phase 12: Cave-ins and supports

- Builds the active tile updates and generation profiles foundations.
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
  - Specify anchoring and maximum supported spans. A placement preview highlights the tiles
    actually stabilized, and removing a load-bearing support shows a warning.
  - Supports are cheap and reclaimable, so using them routinely is practical. No durability or
    recurring repair system.
- **Readable risk and reward**: unstable material has a distinct texture and warning effect.
  Include forgiving first encounters and some valuable veins where shoring up a chamber pays
  off. Secondary collapses must communicate their danger before hitting the player.
- **Persistence and compatibility**: gravel pockets arrive in a new generation profile, so new
  worlds get them and existing (**classic**) worlds keep generating without them, per the
  world-compatibility row. Decide in this phase whether classic worlds get the optional
  "upgrade world" (unchanged, never-explored chunks only) or simply stay as they are. Save
  warning/falling-block state, or settle it by an explicitly defined equivalent rule, without
  losing material, duplicating drops or resetting the danger.
- Stretch, also used later by Descent tremors: ceilings of "unstable rock" collapse when the
  unsupported span gets wider than N tiles. If deferred here, this becomes required in Phase 20.

- [ ] Mining under gravel collapses it after a visible shake. A beam underneath stops it.
- [ ] Falling gravel hurts, and big collapses never stall the game.
- [ ] A player can identify a risky ceiling, preview a useful support and safely mine its reward.
      Warnings work with audio, shake and flashes disabled.
- [ ] Save/reload during a warning or collapse preserves material and danger. Cozy worlds do not
      suffer destructive collapses, and older worlds follow the documented compatibility policy.

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
- **Light design gate before implementation**: prototype the lantern while moving and while
  mining, alongside placed torches. Mining currently uses the best carried pickaxe regardless
  of the selected item, so holding a lantern has no inherent mining tradeoff. Decide whether
  portable light intentionally solves dread as an earned upgrade, or provides travel safety
  while established light is needed for recovery. Update dread thresholds, regeneration,
  helmet behavior and the Descent starting kit together after that decision. The rules above
  and the lantern acceptance check below are the baseline for the prototype, not a settled
  balance decision. Try simpler light/safety rules before adding fuel or another resource meter.
  Starting hypothesis to test first: carried light (lantern, later the helmet) stops dread from
  rising, but health only regenerates in established light (torches, glowing tiles or the sky).
  Travel is safe with a lantern, while recovering still means getting back to a lit place, so
  lit routes and bases keep their value.
- **Flare**: thrown, sticks where it lands, and lights a large area for 30 s, for scouting.
- **Natural light**: glowing mushrooms and crystals as new tiles, placed once strata arrive, so
  not every cave is pitch black.
- **Readable safety**: show whether the player is safe, accumulating dread or recovering, and
  explain why. Make the drawn player glow visibly distinct from light that provides safety.
  Save dread and active flare duration; paused time does not consume either.

- [ ] Standing in an unlit cave fills dread and eventually hurts. A torch or lantern stops it.
- [ ] The incremental-vs-full lighting test still passes with moving lights.
- [ ] The light design gate is resolved and its final rules are reflected in these checks.
      Preparing a lit route has a noticeable benefit under the chosen rules.
- [ ] A muted, reduced-effects playtest can identify darkness danger and reach safety in time.

## Arc 3 – The deep (strata, gear, structures, lifts)

### Phase 14: Strata

- Extends the generation profiles (from Phase 12) with strata in a new profile, redoes the ore
  depth bands per stratum, and applies the world-compatibility policy: worlds made before keep
  their own profile.
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
- **Progression checks**: every new ore can be reached and mined using the preceding tier.
  Each stratum introduces its rule in a forgiving area before combining it with earlier
  hazards. Magma has reachable cooled refuges and a usable survival route before the Phase 15
  heat ward exists; no accessory is a hidden prerequisite for entering its own crafting layer.
- Optional capstone: a sealed **Heart of the Deep** chamber above the bedrock. Opening it is the
  Sandbox's ending.
- Debug: T teleports to the top of the next stratum.

- [ ] Each stratum looks and plays differently at its depth, and the same seed gives the same
  world.
- [ ] Generation stays under 2 s, and the generation tests cover strata bands and ore placement.
- [ ] Fresh-world progression reaches every upgrade without circular tool requirements. Each
      stratum has a learnable first encounter and a practical route back to established safety.

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
- Show equipment effects and tradeoffs in the inventory, including the resulting stat values.
  Avoid mandatory accessories that consume a slot just to make basic exploration viable.
- Show drill fuel and rope length before use. Expand crafting navigation from the companion
  work before the larger recipe list makes text too small.

- [ ] Every accessory's effect shows in play and in F3. Bombs respect pickaxe tier.
- [ ] Equipment choices are understandable without F3; removing gear never deletes inventory
      overflow or leaves the player trapped by an unexplained change in movement or reach.

### Phase 16: Structures and loot

- Seeded structures placed per stratum:
  - **Abandoned mineshafts**: plank corridors with beams, ladders and a chest.
  - **Lost camps**: a bed, a dead torch, a chest and a journal page.
  - **Geodes**: a crystal shell around a core of gems.
  - **Sealed vaults**: walls that need a higher pickaxe tier, with the best loot inside.
- Loot tables per stratum, rolled with the seeded RNG.
- Journal pages hint at a light story, e.g. *"the last expedition went quiet below 400 m"*.
- **Useful discoveries**: structure entrances can be spotted from exploratory branches. A
  detour offers a useful cache, shortcut, safe foothold or new information. Reuse early
  structures to demonstrate supports and lighting before increasing the number of variants.
- Keep found journal pages in a rereadable collection, and mark discovered structures on the
  map. Do not reveal undiscovered structures through fog.
- Apply the compatibility policy when structures change world generation.
- Debug: a key that jumps to the nearest structure.

- [ ] Each stratum has 3 or more structures, and loot is the same for the same seed.
- [ ] Structures and their chests survive saving and reloading.
- [ ] A normal expedition can discover and benefit from a structure without a debug teleport;
      collected pages and discovered markers survive reload.

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
- Name stops, show their depths and indicate an obstructed or disconnected rail before a trip.
  Camp relocation clearly confirms the new respawn point. A failed or blocked homing-flare
  destination does not consume the flare or place the player inside terrain.

- [ ] Can build a 300 m lift and ride it both ways.
- [ ] The camp crafts like both stations and sets the respawn point.
- [ ] Save/reload during travel or camp relocation leaves the player at a valid location with
      one consistent camp and respawn point. The return route saves meaningful expedition time.

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
  - Deliver a quota suited to that floor, e.g. 30 copper on a Stone Caverns floor.
  - Recover a relic from a sealed vault.
  - Light 3 marked beacons.
- **Floor supply and completion guarantees**:
  - Each floor provides accessible wood or a usable substitute, coal/fuel, crafting stations
    or the materials to make them, and enough ore for the next required tool. The starting kit
    alone does not currently cover those needs.
  - Generate objectives from that floor's available resources and a defined baseline arrival
    kit for its position in the run. Quotas must leave enough accessible material for necessary
    upgrades and safety supplies. Show the next floor's required tool before the player leaves.
  - Check that the objective and exit are achievable before accepting a floor seed. The player
    can dig, so "achievable" doesn't need pathfinding: no tile between the arrival, the
    objective and the exit needs a pickaxe tier the floor's supplies can't provide, and the
    required ore, fuel and wood exist in enough quantity outside tier-locked rock. Use
    deterministic retries or a known valid fallback if needed. Validate against the baseline
    kit and fixed floor rules; actual arrival inventory must not change layouts or seed retries.
  - Explain the objective, exit direction and current tremor stage without revealing the whole
    unexplored floor. Protect arrival space from unavoidable immediate hazards.
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
- **Seeds**: the same seed, rules version and eligible pools reproduce floor layouts, loot and
  boon offers. Save/resume does not reroll them. Player actions still determine the outcome.
  **Daily Descent** uses a seed made from the UTC date, displayed in the menu, and standardized
  kit, talent and content-pool rules so profile unlocks do not change the daily challenge. It
  stays local only, with no server. Personal seeded runs use the player's own profile rules.

### Phase 18: Run skeleton

- Mode select on the title screen, and the floor profiles.
- Use simple arrival/exit gates for the skeleton; use the full lifts if Phase 17 is complete.
  Start with "reach the exit" as the objective. The starting boon choice waits for Phase 19;
  include the lantern only if Phase 13's light rules are ready.
- Moving between floors, the run summary on death, and a save slot for resuming a run.
- Establish the floor supply guarantees and versioned run rules. Save floor time, objectives,
  inventory, status and random state with the run.
- **Pressure prototype before expanding content**: once the skeleton works, play one floor
  with one delivery or beacon objective and escalating tremor warnings plus a small collapse.
  Use Phase 12's falling blocks; the full objective pool, unstable ceilings and mutators remain
  in Phase 20. Validate preparation, optional extra looting and escape before building 20 boons.
- Debug: Shift + N skips the current floor (plain N remains the minimap toggle).

- [ ] A run can be played through all 5 floors to the end.
- [ ] Death shows the summary, and quitting mid-floor resumes in the same place.
- [ ] Generated floors have reachable objectives/exits and enough usable supplies for required
      progression across a fixed collection of seeds. Resume preserves content and floor time.
- [ ] The pressure prototype produces a readable choice between leaving and taking another
      reward; playtest notes support the target floor length before Phase 19's full boon pool.

### Phase 19: Boons

- The pick-1-of-3 screen, and about 20 boons wired into PlayerStats and existing systems.
- Rarities, and offers that are deterministic per run seed.
- Begin with a few distinct boons against Phase 18's pressure prototype, then expand toward
  20 once the choices change how a run is played. Preview the effect and any curse before pick.
- Define stacking and trigger limits for chained mining, extra drops and free construction;
  combinations must not create infinite triggers or duplicate items.
- Debug: R rerolls the offer.

- [ ] Every boon has a noticeable effect, and the same seed gives the same offers.
- [ ] Save/resume preserves offered and chosen boons; representative combinations respect
      their limits and leave useful choices across mining, light, movement and safety.

### Phase 20: Objectives, tremors and mutators

- The objective pool, escalating tremors and floor mutators.
- An objective HUD and a tremor warning.
- Implement unstable-ceiling support rules here if they were deferred from Phase 12. Warnings
  and collapse budgets follow the same rules; terrain changes must leave an achievable escape
  with the available kit rather than create an unavoidable death.
- Validate mutator combinations against supplies, objectives and the chosen light rules. Start
  with one mutator per floor; enable pairs only after testing their combined difficulty.

- [ ] Every objective type can be completed.
- [ ] Tremors escalate on schedule, and their collapses follow the cave-in rules.
- [ ] Paused time never advances tremors, torch burnout or run duration. Every enabled mutator
      combination leaves the floor completable; warnings communicate urgency with muted audio.

### Phase 21: Meta progression and dailies

- Core shards, the Base Camp unlock screen, a persistent profile save, run history and Daily
  Descent.
- Record daily date, rules version, standardized starting profile and content pools with each
  daily. Explain how personal seeded runs differ. Do not reinterpret an in-progress run after
  a rules update; retain compatible rules or communicate that it cannot be resumed.
- Summaries explain the cause of death, objective progress and rewards earned, and offer a
  quick retry. The ordinary run history helps players see progress without requiring a win.

- [ ] Unlocks carry across runs and reloads, and two runs on the same daily seed match.
- [ ] Two profiles with different personal unlocks receive identical daily layouts and offers
      under the same daily rules. Profile rewards are credited once across reloads and retries.

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

### Optional enhancements to revisit after Arc 2

These are candidates, not prerequisites for the next phase. Promote an item into an owning
phase with acceptance criteria when playtests show it solves a real problem.

- **Inventory control**: split stacks, choose an exact craft amount, sort storage and name
  chests. Favorite/lock essential tools and supplies so quick stack, deposit and trash respect
  the player's loadout. Start with the action causing the most sorting friction.
- **Quick light action**: temporarily select or place a carried torch, then return to the
  previous selection. Keep this compatible with remapped controls and the final light rules.
- **Renewable supplies**: replantable saplings or a stratum-appropriate wood substitute for
  long-lived sandbox worlds. Keep growth simple before considering a farming system.
- **Personal milestones**: optional records for deepest point, first ore discoveries, safe
  routes built and recovered expeditions. Tie them to the journal or cosmetic keepsakes, with
  no required daily chores. Finding the Heart can show a completion moment and allow continued
  sandbox building afterward.
- **Building comfort**: clearer placement ghosts for doors, camp and lift pieces; preview
  invalid footprints and safe dismantling. Consider decorative variants after functional
  underground building feels useful.
- **Replay and sharing**: copy a world/run seed with its rules version and offer a clean
  screenshot view. Sharing is explicit and local-first; no account or leaderboard is required.
- **Run variety**: test an optional cache or side objective that offers supplies versus a
  boon, or an early extraction choice. Adopt only if it improves the existing risk/reward loop
  without extending runs beyond their target length.

## Order

Work through the phases in number order, with the companion polish in small slices:

1. Phase 11a: consistent pause behavior, save reliability, backups and the input action table.
2. Phase 11b: health, falls and safe recovery; start goal clarity.
3. Phase 12: readable, affordable supports and rewarding hazard encounters, with generation
   profiles keeping older worlds intact; add map pins.
4. Phase 13: resolve portable light versus established safety through a playable prototype.
5. Phases 14–17: distinct strata, understandable equipment choices, useful discoveries and a
   reliable way home. Expand crafting navigation before the recipe list grows.
6. Phase 18: validate a complete floor and the pressure loop before expanding boons in 19 and
   objectives/mutators in 20. Meta progression and standardized dailies follow in 21.

For an early Descent skeleton, Phase 18 needs Phase 11's session/health foundations, Phase 12's
generation profiles (with Phase 14's strata for the floor themes) plus its own supply
guarantees and simple gates. Its pressure
prototype also needs Phase 12's falling blocks. Full darkness uses Phase 13, complete lift/camp
behavior uses Phase 17, and starting boons arrive in Phase 19. Defer these explicitly when
building the smaller skeleton; do not assume they already exist.
