# Dig Deep

A side-view 2D mining and building sandbox that runs in the browser. Dig down through layered
terrain, collect ores, craft better pickaxes to reach harder and more valuable layers, and
build a base with the blocks you collect.

Built with TypeScript, Vite and plain HTML5 Canvas: no game engine, no external assets.

## How to play

**Continue** your most recent world from the title screen, pick another one under **Worlds**,
or start a **New world** (give it a name and a seed, or leave the seed blank for a random one,
and pick **Normal** or **Cozy**).

| Action                             | Input                     |
| ---------------------------------- | ------------------------- |
| Move                               | A / D or ← / →            |
| Jump                               | Space, W or ↑             |
| Dig                                | Hold left mouse on a tile |
| Place the held block               | Left mouse on empty space |
| Build a row                        | Hold left mouse and sweep |
| Throw a held flare or bomb         | Left mouse at a spot      |
| Hang a held rope coil              | Left mouse on an edge     |
| Pick block onto hotbar             | Middle mouse              |
| Quick torch (keeps what you hold)  | T                         |
| Use chest, door, bed, camp, lift   | Right-click it            |
| Climb a ladder                     | W / S or ↑ / ↓ on it      |
| Drop through a platform            | S (hold to keep dropping) |
| Map / minimap                      | M / N                     |
| Add or edit a map pin              | Right-click the map       |
| Select hotbar slot                 | 1–0 or mouse wheel        |
| Drop selected stack                | Q                         |
| Quick stack to nearby chests       | C                         |
| Inventory, crafting, nearest chest | E or Tab                  |
| Move stack (hotbar ↔ bag ↔ chest)  | Shift-click               |
| Wear or take off an accessory      | Shift-click it            |
| Craft 10                           | Shift-click a recipe      |
| Pin a recipe as your goal          | Right-click the recipe    |
| Pause                              | Esc                       |
| Debug overlay (FPS)                | F3                        |

- **Left mouse uses what you're holding.** Holding a block and pointing at an empty spot places
  it (hold and sweep to build a row); pointing at a tile digs it with your best pickaxe,
  whatever is selected. **Right mouse interacts**: it opens chests and doors, sets your bed or
  camp as the respawn point and calls a lift at a lift stop, and never digs or places. In the crafting panel it pins a recipe, and on the map it adds a pin.
- **T places a torch** from anywhere in your inventory without changing what you hold: at the
  cursor, or when that spot can't take one, right next to you. It tells you when you have no
  torches or there's nowhere to put one.
- You start with a wooden pickaxe and 10 torches. Better pickaxes mine faster and reach harder
  blocks: **Wooden → Stone → Copper → Iron → Gold → Emberite** (worlds made before strata have
  no emberite, so gold is their best).
- Chop trees for wood, turn it into planks and a **Workbench**, then mine stone for a
  **Furnace** to smelt ore into bars. Crafting needs the right station within 4 tiles.
- **Strata** (new worlds): the underground is five layers, each with its own rock, ores, look,
  ambient sound and (below the Stone Caverns) a rule of its own. Crossing into one shows its name,
  depth, what's found there and its rule near the top of the screen. Each layer's ore makes the
  pickaxe you need for the next layer's rock and ore.
  - **Topsoil** (0–15 m): dirt over the first stone, with the trees on top.
  - **Stone Caverns** (15–110 m): coal and copper, and pockets of loose gravel.
  - **Fungal Hollows** (110–230 m): damp **mudstone** (needs a stone pickaxe), iron, glowshrooms
    that light the caves teal, and giant mushrooms whose stems give wood. **Damp air**: torches
    only light 5 tiles here (8 elsewhere), a little less at first and fully once you're a dozen
    metres in. Glowshrooms, gem lamps, the lantern and flares don't mind the damp, so a lit way
    through is grown: mine glowshrooms and plant them along it.
  - **Geode Depths** (230–350 m): deepstone (needs copper), gold, **rubies** and **sapphires**
    (need iron), and huge caverns lit by glow crystals. **Floatstone**, pale blue crystals in
    those caverns, lightens gravity within 5 tiles: you jump about twice as high, fall slowly,
    and a fall only counts from where you leave its pull. Mine some (needs copper) and put one
    at the bottom of a long drop.
  - **Magma Layer** (350 m to bedrock): **basalt** (needs iron) and **emberite** ore, which needs
    a gold pickaxe and makes the emberite pickaxe, the fastest there is. Below its first 20 m
    there are **lava** pools and glowing **hot rock**. **Heat**: the tiles near them (3 tiles from
    lava, 2 from hot rock, through air and rock alike) shimmer orange. Standing there is safe for
    4 s (the line under the dread meter counts down, and orange closes in from the screen edges),
    then it burns 1 HP every 1.5 s; the grace comes back twice as fast out of the heat. Lava
    hurts 2 HP as soon as you touch it, and you can't dig or build in it. **Bricks**, heartstone
    and closed doors keep heat out, so a room sealed with bricks is a cool place to rest, and a
    brick wall or floor between you and the lava keeps you cool. No health comes back in the heat.
  - **The Heart of the Deep**: a chamber of glowing heartstone just above the bedrock, some way
    to one side of the spawn (reaching the Magma Layer tells you which way). Its walls need the
    emberite pickaxe. Breaking the Heart inside is the goal of a sandbox world: the moment gets
    a banner, and the Heart drops as a trophy that glows wherever you place it. The world goes on
    as before afterwards, and the world list marks it with ♥.

  Worlds made before strata keep the layers they were made with, and strata worlds made before
  the strata's rules (version 1) get damp torches but no floatstone, lava, hot rock or Heart.
- **Bricks**: stone, mudstone, deepstone and basalt each fire into their own bricks at a furnace
  (4 rock make 4 bricks), for building. Every kind keeps heat out (see the Magma Layer).
- **Gem lamps**: a gold bar and a ruby (or a sapphire) make 2 lamps at a workbench. They light 10
  tiles around (a torch lights 8) with a red or blue glow, and their light heals like a torch's.
- **Wood grows back**: leaves sometimes drop a **sapling**, felled trees included. Plant it on
  grass or dirt and it grows into a tree after 4–7 minutes of play, once there's room above it.
  Giant mushroom caps drop **mushroom spores**, which grow into a giant mushroom on mudstone.
  Nothing grows while the game is paused.
- **The dark hurts** (Normal worlds). Standing where it's too dark (more than about 6 tiles
  from a torch) fills the **dread** meter under your hearts in about 25 s; in light it drains in
  a few seconds. When it's full you hear a heartbeat, red closes in from the screen edges and
  you lose 1 HP every 2 s. The line under the meter says how things stand and why. The faint
  glow right around you only helps you see: it doesn't keep dread away.
  - **Torches**, **glowshrooms**, **glow crystals**, the camp's stove and the sky are established
    light: they keep dread away and your health only comes back in their light.
  - A **lantern** (2 iron bars and a torch at a workbench) lights 6 tiles around you while it's
    in your hand, and you can still dig while holding it. Its light keeps dread away wherever
    you go, but it doesn't heal: get back to a torch (or place one) for that.
  - **Flares** (a torch and 2 coal make 2, at a workbench): with one in hand, left mouse throws
    it at the cursor. It sticks where it lands and lights about 11 tiles around for 30 s, for
    scouting ahead. Like the lantern's, its light keeps dread away but doesn't heal.
  - Glowshrooms glow teal and glow crystals violet, tinting the cave around them. In new worlds
    glowshrooms grow in the Fungal Hollows and glow crystals line the Geode Depths; mine them to
    light other places.
- **Chests** (8 planks at a workbench) hold 20 stacks. Right-click one, or press E near one,
  to open it next to your inventory: **Loot all**, **Deposit all** (your bag, not the hotbar) and **Quick stack**
  (only items the chest already holds). C quick-stacks into every chest within 4 tiles, and
  crafting uses what's in chests within 4 tiles too (and in the chest you have open). Breaking
  a chest drops what's in it.
- **Ladders** (3 planks make 4), **platforms** (1 plank makes 2) and **doors** (6 planks) are
  made at a workbench. Hold W or S on a ladder to climb; Space hops off and S + Space lets go.
  You can stand on top of a ladder, so a shaft with a ladder in it can be walked over. Jump up
  through platforms, and press S to drop down through one (hold S to keep dropping through
  the ones below). Doors are two tiles tall and need ground under them; right-click to open
  or close one. A door opens toward the way you were facing when you placed it (its handle
  is on the other side).
- **Health** (Normal worlds): 10 HP, shown as 5 hearts in the top left. Falls of more than 12
  tiles hurt; grab a ladder on the way down (hold W or S) and the fall ends safely, and walking
  off a ledge into a ladder shaft catches you on the ladder. Health comes back slowly after 5 s
  without damage, but only in established light (see the dark, above). Right after a hit you can't be hurt again for a moment (the hearts get a light
  outline and a bar under them).
- **Beds** (10 planks and 4 wood at a workbench) are two tiles wide. Right-click one to respawn
  there; it's marked on the map. When you die your bag goes into a **satchel** where you died
  (your hotbar and every pickaxe stay with you). Satchels stay until you collect them, show on
  the map and in the top-left corner, and keep whatever doesn't fit in your inventory. With no
  bed, or a blocked one, you wake up near the world spawn. You also keep your gear and the
  drill.
- **Lifts**: a column of **lift rail** (an iron bar and 2 planks make 16, at a workbench) with
  **lift stops** beside it (an iron bar and 4 planks each) is a lift. You can climb the rail
  like a ladder while you build it. A stop goes on a floor right beside the rail. Right-click a
  stop to open the lift panel: it lists every stop on that rail with its name and depth, where
  the cage is, and whether you can get there (it warns about a broken rail, or something in the
  way where you'd step out). Click a stop to ride: the cage comes to fetch you if it's elsewhere
  (wait by the stop), then carries you there at up to 50 tiles a second, about five times
  faster than a ladder. New stops are named after their layer; rename the one you're at from
  the panel. Stops show on the map with their names.
- **The camp** (a workbench, a furnace, a bed and 2 iron bars make a camp kit, at a workbench) is
  a 2 x 2 tent and stove that works as a workbench, a furnace and a bed in one. Its stove is a
  campfire that lights 7 tiles around, and like a torch's its light heals and keeps dread away
  (the damp doesn't dim it), so a camp is a safe place to rest wherever you set it up. Setting
  it up on solid ground makes it your respawn point (right-click it to make it your respawn
  point again after using a bed). Break it to pack it up into a camp kit and set it up again
  deeper down. You can have one camp at a time; it shows on the map. If your camp is packed up
  or blocked when you die, you wake up in your bed (and the other way round).
- **Gear**: the inventory's **Gear** box has 4 slots for accessories, one of each. Craft them at
  a workbench (the Gear tab), then shift-click one to wear it, or drop it on a gear slot.
  Hovering one shows what wearing it (or taking it off) changes, the box lists your stats with
  the changed ones in green, and closing the inventory says what changed.
  - **Miner's helmet**: carried light 4 tiles around you (keeps dread away, doesn't heal), with
    your hands free.
  - **Toolbelt**: stations and chests work from 4 tiles further away.
  - **Magnet charm** (sapphires): drops fly to you from 3 tiles further away.
  - **Long-handled grip**: reach 1.5 tiles further.
  - **Spring boots** (floatstone): jump about 1.6 tiles higher.
  - **Padded boots**: fall 8 tiles further without getting hurt.
  - **Heat ward** (rubies): hot zones burn you half as often (lava still burns as much).
  - **Climbing claws**: in the air, push against a wall to slide down it slowly (a slide never
    counts as a fall), hold W as well to cling still, and press Space to leap off it.
- **Tools** (Tools tab, at a workbench):
  - **Bombs** (an iron bar and 4 coal make 3): left mouse throws one at the cursor. It sticks
    where it lands and goes off after 2 s, breaking the 3 x 3 around it: whatever your best
    pickaxe could mine, never bedrock. Stand clear: it hurts if you're within 2 tiles.
  - **Rope coil** (5 planks): left mouse on an empty spot with something solid above or beside
    it (the lip of a shaft) hangs a rope ladder up to 20 tiles straight down. The cursor shows
    how far it reaches first. Climb it like a ladder; break any part of it to roll it back up.
  - **Drill** (8 emberite bars and 4 iron bars): with it in hand, it mines anything the
    emberite pickaxe can, about twice as fast, burning one coal from your inventory every 8
    tiles. The hotbar shows how much drilling your coal is good for. You keep it when you die.
- **Gravel** (lumpy, light grey) is loose: it rests only on what's right under it. Dig that
  out and the gravel shakes for a moment, with dust trickling down and an orange outline, then
  falls, and it hurts if it lands on you. Gravel hanging from a cave ceiling (pebbles dangle
  under it) stays put until you dig or build right next to it, then comes down column by
  column. New worlds have gravel pockets, often in cave ceilings, and deeper ones sometimes
  hide ore. **Beams** and **crossbeams** (1 plank makes 2 of either, no station needed) hold it
  up, better than blocks do: a block holds only the tile right on it, but supports also hold
  gravel diagonally above them, so a few of them shore a whole ceiling and leave it open. A beam
  is a post you walk through. It goes on solid ground or on another beam, and its top holds the
  tile above it and one to each side (10 beams high at most); take out the bottom and the beams
  above it break. A crossbeam, or a platform, holds the tiles above its row and one past each
  end, if the row rests within 4 tiles on a wall, a beam, the ground, or solid rock right above
  it. Holding one shows which gravel it would hold up (green), with a
  line of help the first time; the inventory tooltips have the details. Pointing at a beam that
  holds gravel up warns you before you take it out. Worlds from before gravel existed don't get any.
- **Cozy** worlds have no damage at all (heat and lava don't burn), no dread, and their gravel never falls. Worlds from before health existed are Cozy. Change it
  any time from the pause menu.
- **M** opens the map: drag or use WASD to pan, scroll to zoom. It only shows what you've
  seen: places you've had on screen in the light, and anything close to you in the dark. **N**
  toggles the minimap in the corner (it's in Settings too).
- **Map pins**: right-click a place you've explored on the map to pin it (up to 12), then type
  a name (Enter to finish, Esc to keep the old one). Right-click a pin to rename it, **Track**
  it or **Delete** it. The tracked pin (white) shows its name, distance and direction under your
  hearts and on the minimap, so you can find your way back without opening the map.
- **Next goal**: right-click a recipe in the crafting panel to pin it (right-click again, or
  **Unpin**, to clear it). The top-left corner then shows what it needs, how many you have
  (counting chests within 4 tiles), where to craft it and, for missing ore, the depths it's
  found at. The **Next goal** box in the inventory also suggests your next pickaxe and where
  its ore is; click it to pin that pickaxe.
- In the inventory, hover anything for a tooltip. The trash slot (top right) destroys a stack;
  you can take the last one back. Recipes are in tabs (Blocks, Light, Tools, Gear, Materials,
  Stations), each showing how many of its recipes you can craft right now, and **Craftable
  only** hides recipes you can't make yet. Click **Search recipes** and type to list every
  recipe that makes or uses something with that in its name (Enter keeps it, Esc clears it).
- The world stands still while the inventory, the map, the lift panel or the pause menu is open. Switching to
  another window or tab pauses the game too; press **Resume** (or Esc) to carry on.
- The game saves to your browser (IndexedDB) automatically: within a couple of seconds of any
  change, every 60 seconds, and when you pause. Each world has its own save; delete one from
  the Worlds screen (it asks you to click twice). **Save & quit** only leaves once the save is
  written: if it fails, the game stays open so you can try again or export a backup.
- **Backups**: **Export** on the Worlds screen (or **Export backup** on the pause menu)
  downloads a world as a `.json` file. **Import backup** on the Worlds screen checks the file,
  then adds it as a new world, or replaces the world with the same seed if you click Replace
  twice. Backups only import into the version of the game that saved them.
- **Settings** (on the title screen and the pause menu) has the master, sound-effect and
  ambience volumes (ambience is each stratum's quiet background sound), screen shake, reduced
  flashes (no break flash, ore glints or red hurt flash), pixel scale (auto, 2x or 3x), an FPS
  counter and the minimap. They're kept per browser. Sound starts after your first click or key
  press, as browsers require.

## Development

Needs [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run dev       # dev server at http://localhost:5173 (opens a browser)
npm test          # unit tests (Vitest)
npm run build     # type-check, then build the static site into dist/
npm run build:dev # the same, as the dev-site build (own save slot, "DEV BUILD" tag)
npm run preview   # serve the built dist/ locally
```

Add `?debug` to the URL (for example `http://localhost:5173/?debug`) for testing shortcuts:
**G** gives a materials kit (**Shift+G** a gear kit: every accessory, bombs, rope coils, a drill
and coal), **F** toggles fly mode, **I** cycles instant mining (off / 1x1 /
3x3), **L** toggles lighting, **O** puts a patch of every ore and gem at the cursor, **K** digs a
100 m ladder shaft down from the cursor, **V** reveals the whole map, **H** toggles god mode
(and heals), **J** deals 2 damage, **B** puts a 3 x 3 block of gravel at the cursor (it
falls if nothing holds it up), **U** fills the dread meter (press again to empty it), **Y**
takes you to the top of the next stratum (from the Magma Layer, back to the spawn), **P**
makes planted saplings and spores grow now, **X** stands you on the roof of the Heart of the
Deep's chamber, **Z** puts 4 lava tiles at the cursor (to try heat anywhere) and **R** builds a
300 m lift down from the cursor, with a stop every 100 m. The kit includes a lantern, flares,
glowshrooms, glow crystals, saplings, mushroom spores, gem lamps, floatstone, lift rails and
stops, a camp kit and the strata's rocks, ores and gems. The
title screen also
gets a button that marks your most recent world as an older version, and the pause menu a
**Debug: saves fail** switch for trying a failed Save & quit. In debug mode the game doesn't
pause when its window loses focus, and the running game is on `window.digDeep` in the browser
console (`screen`, `game`, `pausedBy`, `save()`, `backupText()`, `importBackup(text)`) for
scripted checks.

`SPEC.md` is the original design spec, `ROADMAP.md` plans what comes next, and `CLAUDE.md`
describes the code layout and conventions, with topic details in `.claude/rules/`. All tunable numbers (physics, mining, lighting,
world generation) live in `src/config.ts`.

**Performance reference.** Performance passes are measured on the developer's Windows 11 PC
in Chrome (155): Intel Core i9-13900K, NVIDIA GeForce RTX 4090, 128 GB RAM, a 3840×2160 display
at 240 Hz with 125% scaling. Use the F3 overlay's FPS and frame time in a busy underground
scene: torches, a lit cave, digging and falling items. This PC is much faster than a typical
laptop, so Chrome DevTools' CPU throttling (4×) gives a rough idea of slower machines.

## Branches and deploys

| Branch      | Role                                                   | Published at                                |
| ----------- | ------------------------------------------------------ | ------------------------------------------- |
| `main`      | The live game; updated by release PRs from `develop`   | https://swalliso.github.io/dig-deep/        |
| `develop`   | Work in progress; finished features are merged here    | https://swalliso.github.io/dig-deep/dev/    |
| `feature/…` | One branch per roadmap phase, made from `develop`      | not published; CI runs the tests and builds |
| `hotfix/…`  | Urgent fixes, made from `main` and merged back to both | via `main`                                  |

Features go `feature/…` → pull request into `develop` → (when a batch is ready) pull request
from `develop` into `main`. The CI workflow tests and builds every pull request.

The dev site is built with `npm run build:dev`. It keeps its own save, separate from the live
game's (both sites share the `swalliso.github.io` origin, and with it the browser storage), and
shows a "DEV BUILD" tag on the title screen.

## Deploying

`npm run build` writes a fully static site to `dist/`. It uses relative paths, so it works
from any folder on any static host:

- **GitHub Pages** (set up for this repo): on every push to `main` or `develop`,
  `.github/workflows/deploy.yml` tests and builds both branches and publishes `main` at the site
  root and `develop` under `/dev/`. The repo's Settings → Pages source is "GitHub Actions", and
  Settings → Environments → `github-pages` must allow deployments from both `main` and
  `develop`. Each run shows up under the Actions tab.
- **Netlify**: build command `npm run build`, publish directory `dist`. Or drag the `dist/`
  folder onto the Netlify dashboard.
- **itch.io**: zip the *contents* of `dist/` (so `index.html` is at the top of the zip),
  upload it as an HTML game and tick "This file will be played in the browser".

Opening `dist/index.html` straight from disk (`file://`) won't work, because browsers block
module scripts there. Use any static server, such as `npm run preview`.
