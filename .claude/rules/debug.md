---
paths:
  - "src/debug.ts"
  - "src/input.ts"
  - "src/main.ts"
---

# Debug mode

Add `debug` to the URL (`http://localhost:5173/?seed=42&debug`) to turn on testing shortcuts:
**G** gives a materials kit (enough for every recipe, plus a workbench, a furnace, three
chests, two beds, a lantern, flares, glowshrooms, glow crystals, saplings, mushroom spores, gem
lamps, floatstone, lift rails and stops, a camp kit, and stacks of ladders, platforms, doors,
gravel, beams and crossbeams), **F** toggles fly mode (no gravity or collision; W/S or ↑/↓ for
up/down, Shift for 4x speed),
**I** cycles instant mining off → 1x1 → 3x3 brush (reach and pickaxe-tier rules still apply,
bedrock stays unbreakable, drops and tree felling work as normal), **L** toggles lighting
(fullbright) for exploring, **O** puts a 7 x 2 patch of every ore and gem at the cursor (for
ore sounds and glints), **K** digs a 100 m ladder shaft down from the cursor, **V** reveals the
whole map, **H** toggles god mode (and heals), **J** deals 2 damage (to test falls, fly up
with F and turn fly off), **B** puts a 3 x 3 block of gravel at the cursor (in the open it
shakes and falls at once; in rock it's a pocket to dig under), **U** fills the dread meter
(again: empties it), **Y** goes to the top of the next stratum in a strata world (from the Magma
Layer, back to the spawn; it carves a pocket if there's no open space near the top), **P**
makes every planted sapling and mushroom sprout grow now (if it has room), **X** stands the
player on the roof of the Heart of the Deep's chamber (strata v2 worlds), **Z** puts 4 lava
tiles at the cursor (to try heat and insulation anywhere) and **R** builds a 300 m lift down
from the cursor (rail, with a named stop and a carved landing at the top, every 100 m and at
the bottom).

Debug mode also opens the F3 overlay at start, the title screen gets a button that marks the
most recent world as an older version (to test the version-mismatch screen), and the pause menu
gets a **Debug: saves fail** switch (to test a failed Save & quit). In debug mode losing focus
doesn't pause the game, so checks keep running in a background preview pane, and
`window.digDeep` exposes the running game for scripted browser checks (`screen`, `game`,
`pausedBy`, `lastSavedAt`, `state`, `save()`, `backupText()`, `importBackup(text)`).

All cheats live in `src/debug.ts`; their keys are the `debug*` actions in `src/input.ts`. When a
new phase adds something slow to reach by playing, add a shortcut there, list it here and in
README.md's debug paragraph, and mention it in the phase's test steps.
