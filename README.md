# Dig Deep

A side-view 2D mining and building sandbox that runs in the browser. Dig down through layered
terrain, collect ores, craft better pickaxes to reach harder and more valuable layers, and
build a base with the blocks you collect.

Built with TypeScript, Vite and plain HTML5 Canvas: no game engine, no external assets.

## How to play

Start a **New world** from the title screen (type a seed, or leave it blank for a random one),
or **Continue** your saved world.

| Action               | Input              |
| -------------------- | ------------------ |
| Move                 | A / D or ← / →     |
| Jump                 | Space, W or ↑      |
| Mine                 | Hold left mouse    |
| Place block          | Right mouse        |
| Select hotbar slot   | 1–0 or mouse wheel |
| Inventory / crafting | E or Tab           |
| Pause                | Esc                |
| Debug overlay (FPS)  | F3                 |

- You start with a wooden pickaxe and 10 torches. Better pickaxes mine faster and reach harder
  blocks: **Wooden → Stone → Copper → Iron → Gold**.
- Chop trees for wood, turn it into planks and a **Workbench**, then mine stone for a
  **Furnace** to smelt ore into bars. Crafting needs the right station within 4 tiles.
- Caves are dark, so place torches.
- The game saves to your browser (IndexedDB) automatically: within a couple of seconds of any
  change, every 60 seconds, and when you pause. There's one save slot per browser and site.

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
3x3), and **L** toggles lighting. The title screen also gets a button that marks your save
as an older version.

`SPEC.md` is the original design spec, `ROADMAP.md` plans what comes next, and `CLAUDE.md`
describes the code layout and conventions. All tunable numbers (physics, mining, lighting,
world generation) live in `src/config.ts`.

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
