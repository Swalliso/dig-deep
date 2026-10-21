---
paths:
  - "src/entities/player.ts"
  - "src/input.ts"
  - "src/systems/building.ts"
  - "src/systems/mining.ts"
  - "src/systems/smartCursor.ts"
  - "src/systems/tools.ts"
  - "src/ui/controls.ts"
  - "tests/player.test.ts"
  - "tests/traversal.test.ts"
  - "tests/falls.test.ts"
  - "tests/mining.test.ts"
  - "tests/actions.test.ts"
  - "tests/controls.test.ts"
  - "tests/smartCursor.test.ts"
  - "tests/tools.test.ts"
---

# Player, physics, mining and input

- **Physics**: player intent comes in as a plain `PlayerControls` object, so physics can be
  unit-tested without the DOM. Movement is split into steps of at most `MAX_MOVE_STEP` px,
  resolved X then Y, so nothing tunnels through tiles.
- **Jump corner correction**: a jump whose head clips a ceiling edge on one side only, by at most
  `JUMP_CORNER_CORRECTION` (6 px), slides sideways past it and keeps rising, so jumping into a
  one-tile hole doesn't need perfect alignment. Only if the shifted box is clear; a head-on hit
  still stops the jump, and jump height is unchanged. Not on ladders or in fly mode.
- **Careful walk** (playtest, the `careful` action, Shift): while held there's no auto step-up
  onto 1-tile ledges, so shaving a layer off the ground while walking doesn't lift the player
  onto it. It doesn't stop the player walking off ledges (decided). Shift is also the `modifier`
  (panel only, where the world is paused) and debug fly's fast key.
- **Walk-off ladder catch** (Phase 11b, changed in playtesting): walking off a ledge into a
  ladder or rope column catches the player only once the fall has passed
  `WALK_OFF_CATCH_TILES` (3), so a one-tile step down beside a rope doesn't latch on. W or S
  grab one at any height; jumping or dropping in never catches.
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
- **Smart cursor** (playtest, a Settings switch framed as accessibility, off by default; no key,
  since Ctrl+W can close the tab and a toggle key waits for the remapping screen): a dig aims at
  the first tile on the line from the player's centre toward the pointer that's solid (or is the
  pointed tile itself, so ladders, torches and trees are only dug when pointed at), within reach;
  a held block goes in the first spot on that line that `canPlace` accepts (tiles on the line
  don't block it, so a row grows outward; the player's own tiles are skipped unless pointed at).
  Both lines run out to reach, past the pointer. With nothing found, the tile under the pointer
  is used as before (so its hints show). Smart drag-building places at most one block per cursor
  tile per hold (`aimedThisHold` in game.ts), so a click places one and a sweep one per tile
  crossed. The target gets yellow corner brackets around its usual outline. Throwing, ropes,
  right-click, middle-click and quick torch keep using the tile under the pointer.
- **Input**: game code reads keys only through actions (`actionDown('jump')`,
  `actionPressed('inventory')`) from the table in `input.ts`. Any text that names a key builds it
  with the helpers in `ui/controls.ts`, so a remapping screen only edits the table. A test
  rebinds every action and checks no default key name is left in the hints, and a test keeps
  README.md's controls table matching the Controls screen with every row short enough to fit.
- **Climbing claws** (Phase 16, `wallGrip` stat): in the air, a move key pushing against a solid
  tile beside the body grips the wall (`Player.onWall`): falling slows to `WALL_SLIDE_SPEED`,
  holding up as well clings still, S lets go, and a jump press without up (Space) leaps off,
  away from the wall. A grip resets `fallTop`, so a slide is never a fall. W is both jump and
  climb up, so W clings like it climbs a ladder.
- **Tools** (Phase 16): `primaryAction` digs with the drill (at least `DRILL_TIER`, at
  `DRILL_SPEED`, while there's coal; one coal per `DRILL_TILES_PER_COAL` tiles), throws bombs
  like flares and hangs a rope coil, or on a rope (or the spot under its end) adds the coil to
  that rope's bottom end (once per press). Gear only changes in the inventory panel, so stats
  are recomputed from the worn gear every step.
- **Rope accounting** (package G, `systems/tools.ts`): only a rope's tiles are saved, so a rope
  of length L always counts as `ropeCoils(L)` = ceil(L / 20) coils, and its slack is what those
  coils hold beyond L. Cutting a rope tile keeps the part above (U tiles) and rolls up the part
  below, giving back `ropeCoils(L) − ropeCoils(U)` coils (all of them when the top is cut),
  dropped at the player rather than down the shaft. The rest of a coil cut partway is the upper
  part's slack, so it unrolls straight back into the gap (`RopeSlack`): a stray cut costs
  nothing. A coil that lands a rope on another rope's top joins them and only takes a coil if
  the joined rope counts more than they did. Rope has hardness 1.0 (coal ore's, above stone's
  0.8). The smart cursor passes over ropes like ladders.
- **Lift rides** (Phase 15): while riding, the player is attached to the cage (`Player.rideTo`
  each step instead of `update`), so there's no moving-platform physics; digging and building
  are off. Lift rail is climbable like a ladder.
- **Typing mode**: while a map pin's or lift stop's name or the recipe search (Phase 16) is being
  typed (`startTyping` in `input.ts`), key presses edit the text instead of reaching the actions,
  except the `confirm` and `pause` keys, which end the typing (Esc clears the search rather than
  closing the inventory); the game ends typing whenever the map, the lift panel or the inventory
  closes or the pause menu opens.
