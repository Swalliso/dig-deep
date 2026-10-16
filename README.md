# Dig Deep

A side-view 2D mining and building sandbox that runs in the browser. Dig down through layered
terrain, collect ores, craft better pickaxes to reach harder and more valuable layers, and
build a base with the blocks you collect.

Built with TypeScript, Vite and plain HTML5 Canvas: no game engine, no external assets.

## How to play

**Continue** your most recent world from the title screen, pick another one under **Worlds**,
or start a **New world** (give it a name and a seed, or leave the seed blank for a random one).

| Action                             | Input                     |
| ---------------------------------- | ------------------------- |
| Move                               | A / D or ← / →            |
| Jump                               | Space, W or ↑             |
| Dig                                | Hold left mouse on a tile |
| Place the held block               | Left mouse on empty space |
| Build a row                        | Hold left mouse and sweep |
| Pick block onto hotbar             | Middle mouse              |
| Open chest, open or close door     | Right-click it            |
| Climb a ladder                     | W / S or ↑ / ↓ on it      |
| Drop through a platform            | S + Space                 |
| Map / minimap                      | M / N                     |
| Select hotbar slot                 | 1–0 or mouse wheel        |
| Drop selected stack                | Q                         |
| Quick stack to nearby chests       | C                         |
| Inventory, crafting, nearest chest | E or Tab                  |
| Move stack (hotbar ↔ bag ↔ chest)  | Shift-click               |
| Craft 10                           | Shift-click a recipe      |
| Pause                              | Esc                       |
| Debug overlay (FPS)                | F3                        |

- **Left mouse uses what you're holding.** Holding a block and pointing at an empty spot places
  it (hold and sweep to build a row); pointing at a tile digs it with your best pickaxe,
  whatever is selected. **Right mouse interacts**: it opens chests and doors, and never digs or
  places.
- You start with a wooden pickaxe and 10 torches. Better pickaxes mine faster and reach harder
  blocks: **Wooden → Stone → Copper → Iron → Gold**.
- Chop trees for wood, turn it into planks and a **Workbench**, then mine stone for a
  **Furnace** to smelt ore into bars. Crafting needs the right station within 4 tiles.
- Caves are dark, so place torches.
- **Chests** (8 planks at a workbench) hold 20 stacks. Right-click one, or press E near one,
  to open it next to your inventory: **Loot all**, **Deposit all** (your bag, not the hotbar) and **Quick stack**
  (only items the chest already holds). C quick-stacks into every chest within 4 tiles, and
  crafting uses what's in chests within 4 tiles too (and in the chest you have open). Breaking
  a chest drops what's in it.
- **Ladders** (3 planks make 4), **platforms** (1 plank makes 2) and **doors** (6 planks) are
  made at a workbench. Hold W or S on a ladder to climb; Space hops off and S + Space lets go.
  You can stand on top of a ladder, so a shaft with a ladder in it can be walked over. Jump up
  through platforms, and press S + Space to drop down through one. Doors are two tiles tall
  and need ground under them; right-click to open or close one.
- **M** opens the map: drag or use WASD to pan, scroll to zoom. It only shows what you've
  seen: places you've had on screen in the light, and anything close to you in the dark. **N**
  toggles the minimap in the corner (it's in Settings too).
- In the inventory, hover anything for a tooltip. The trash slot (top right) destroys a stack;
  you can take the last one back. **Craftable only** hides recipes you can't make yet.
- The world stands still while the inventory, the map or the pause menu is open. Switching to
  another window or tab pauses the game too; press **Resume** (or Esc) to carry on.
- The game saves to your browser (IndexedDB) automatically: within a couple of seconds of any
  change, every 60 seconds, and when you pause. Each world has its own save; delete one from
  the Worlds screen (it asks you to click twice). **Save & quit** only leaves once the save is
  written: if it fails, the game stays open so you can try again or export a backup.
- **Backups**: **Export** on the Worlds screen (or **Export backup** on the pause menu)
  downloads a world as a `.json` file. **Import backup** on the Worlds screen checks the file,
  then adds it as a new world, or replaces the world with the same seed if you click Replace
  twice. Backups only import into the version of the game that saved them.
- **Settings** (on the title screen and the pause menu) has the master and sound-effect
  volumes, screen shake, pixel scale (auto, 2x or 3x), an FPS counter and the minimap. They're kept per
  browser. Sound starts after your first click or key press, as browsers require.

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
**G** gives a materials kit, **F** toggles fly mode, **I** cycles instant mining (off / 1x1 /
3x3), **L** toggles lighting, **O** puts a patch of every ore at the cursor, **K** digs a
100 m ladder shaft down from the cursor, and **V** reveals the whole map. The title screen also
gets a button that marks your most recent world as an older version, and the pause menu a
**Debug: saves fail** switch for trying a failed Save & quit. In debug mode the game doesn't
pause when its window loses focus, and the running game is on `window.digDeep` in the browser
console (`screen`, `game`, `pausedBy`, `save()`, `backupText()`, `importBackup(text)`) for
scripted checks.

`SPEC.md` is the original design spec, `ROADMAP.md` plans what comes next, and `CLAUDE.md`
describes the code layout and conventions. All tunable numbers (physics, mining, lighting,
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
