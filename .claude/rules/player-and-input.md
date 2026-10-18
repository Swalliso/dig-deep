---
paths:
  - "src/entities/player.ts"
  - "src/input.ts"
  - "src/systems/building.ts"
  - "src/systems/mining.ts"
  - "src/ui/controls.ts"
  - "tests/player.test.ts"
  - "tests/traversal.test.ts"
  - "tests/falls.test.ts"
  - "tests/mining.test.ts"
  - "tests/actions.test.ts"
  - "tests/controls.test.ts"
---

# Player, physics, mining and input

- **Physics**: player intent comes in as a plain `PlayerControls` object, so physics can be
  unit-tested without the DOM. Movement is split into steps of at most `MAX_MOVE_STEP` px,
  resolved X then Y, so nothing tunnels through tiles.
- **Jump corner correction**: a jump whose head clips a ceiling edge on one side only, by at most
  `JUMP_CORNER_CORRECTION` (6 px), slides sideways past it and keeps rising, so jumping into a
  one-tile hole doesn't need perfect alignment. Only if the shifted box is clear; a head-on hit
  still stops the jump, and jump height is unchanged. Not on ladders or in fly mode.
- **S drops through platforms**: pressing S while standing on a platform drops through it
  (ROADMAP's Phase 10 had S + Space, which still works). Holding S keeps dropping through the
  platforms below; letting go stops on the next one. S held since before landing (falling or off
  a ladder) doesn't drop, so only a fresh press starts a drop.
- **Mining damage persists per tile, for a while**: each tile keeps its damage (and cracks) even
  if the cursor moves away or the button is released (the spec reset it). After
  `DAMAGE_REPAIR_DELAY` (3 s) without a hit it heals back to full over `DAMAGE_REPAIR_TIME`.
- **Mouse**: a left press decides what its hold does (`primaryAction` in `systems/building.ts`):
  holding a block over an empty spot places it (hold to sweep), anything else digs with the best
  carried pickaxe, and held tools get their own actions. Right-click only interacts (chests,
  doors, beds, the camp, lift stops); it never digs or places. In the crafting panel it pins a
  recipe, and on the full map it adds or picks a map pin (the `pin` action). E or Tab also opens
  the nearest chest in reach. (The spec had left mine and right place; a tester found right-click
  doing both placing and interacting confusing.)
- The floating "Need better pickaxe" hint (instead of a toast) was reviewed and kept.
- **Input**: game code reads keys only through actions (`actionDown('jump')`,
  `actionPressed('inventory')`) from the table in `input.ts`. Any text that names a key builds it
  with the helpers in `ui/controls.ts`, so a remapping screen only edits the table. A test
  rebinds every action and checks no default key name is left in the hints, and a test keeps
  README.md's controls table matching the Controls screen with every row short enough to fit.
- **Lift rides** (Phase 15): while riding, the player is attached to the cage (`Player.rideTo`
  each step instead of `update`), so there's no moving-platform physics; digging and building
  are off. Lift rail is climbable like a ladder.
- **Typing mode**: while a map pin's or lift stop's name is being typed (`startTyping` in
  `input.ts`), key presses edit the text instead of reaching the actions, except the `confirm`
  and `pause` keys, which end the typing; the game ends typing whenever the map or the lift panel
  closes or the pause menu opens.
