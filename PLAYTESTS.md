# Dig Deep – Playtest feedback

Feedback from people playing the game, triaged against the code and turned into work. This file
is the intake: `ROADMAP.md` stays the plan. When a package below is scheduled, its scope and
acceptance criteria go into `ROADMAP.md` (as a slice or phase), and the items here point to it.

How an item moves:

1. **Logged** under its round with an ID (`P1-04` = round 1, item 4), in our own words. Testers'
   raw notes aren't copied in.
2. **Triaged**: what's actually happening in the code, what kind of item it is, and our call.
3. **Packaged**: grouped with related items, from any round, into a work package small enough
   for one branch, or parked in the wishlist.
4. **Closed** with the PR that fixed it, or with the reason we're keeping things as they are.

Kinds: **Bug** (not what we meant), **Tuning** (works as designed, numbers or feel are off),
**Design** (needs a decision before anyone builds), **Request** (a new feature).

Status: `open` (needs a decision), `planned` (in a package), `keep` (intended, stays),
`done` (PR link), `won't do` (reason).

## How to playtest

For us and anyone else who plays. There are two kinds of testing, and they don't mix:

- **Does a change work?** Debug mode is fine (`?debug`): follow the phase's or package's test steps.
- **How does the game feel?** No debug mode, a fresh world. Debug mode spoils this: the kit, fly
  mode and the revealed map skip exactly the parts we want to feel.

**One goal per round**, such as "the early game, up to the iron pickaxe or 90 minutes". After a
change, repeat the same round the same way, so the numbers compare like with like.

**The run**: the dev site (https://swalliso.github.io/dig-deep/dev/), a new Normal world, no
`?debug`. Play like a player, not like a tester. Export a backup from the pause menu ("Export
backup") at each milestone (each pickaxe, the first time in a new stratum) and whenever something
odd happens, and rename it after the round and moment: `r3-copper.json`.

**Notes while playing**: one line each, with a tag and roughly where (stratum or depth):

| Tag | Means |
| --- | --- |
| `+` | felt good |
| `-` | felt bad |
| `?` | confusing |
| `zzz` | boring or grindy |
| `!` | bug |

For example: `zzz Stone Caverns ~60 m: 10 minutes of tunnelling for one copper vein`.

**Debrief**, short, per stratum reached:

- **Caves**: how often did one worth exploring turn up, how big were they, and did they pay?
- **Ore**: how did you mostly find it: cave walls, tunnelling, the map, glints?
- **Light**: did torches or coal run short?
- **Time**: roughly how it split between exploring, tunnelling, travelling and managing items.

Then the **three things to change first**.

Report what happened and how it felt rather than the fix, and mark how much each point matters
(blocker, annoying or nitpick; once or every time). Any shape is fine (a list, a voice note, a
chat): it gets triaged here as a new round.

**The numbers** (`src/analysis/`, run from a checkout after `npm install`):

- `npm run report:world -- --seeds 1,2,3,4,5`: generates worlds with the profile new worlds get
  and prints, per stratum, open space, cave sizes, ore and veins per type, and how much ore a cave
  shows (exposed) versus how much is buried; then the cave mouths at the surface.
- `npm run report:backup -- r3-stone.json r3-copper.json`: compares each backup with its world
  regenerated from the seed and prints a timeline (play time, pickaxe, depth, tiles dug, ore mined
  and how much came from veins a cave showed, torches placed), then per backup the tiles dug and
  explored per stratum, the ore mined per type, and the bars, ore, coal and torches carried and in
  chests.

Both print markdown, so a round's tables can be pasted straight into its entry below.

## Packages

| Package | Items | Where | Status |
| --- | --- | --- | --- |
| A. World fixes | P1-01, P1-04, P1-05, P1-08, P1-15 | `feature/playtest-world-fixes` | done ([#27](https://github.com/Swalliso/dig-deep/pull/27)) |
| B. Early game and the ore economy | P1-02, P1-03, P1-12, P1-13, P2-01, P2-02, P2-03 | design session, then slices B1 and B2 before Phase 17 | needs design |
| C. Readability and art | P1-06, P1-07 | small slice, any time | ready |
| D. Wishlist | P1-10, P1-11 | not planned | – |
| E. Movement and targeting controls | P1-09, P1-14, P2-04 | `feature/playtest-controls` | done ([#28](https://github.com/Swalliso/dig-deep/pull/28)) |

**Order (lean)**: A and E first. They're small and touch different files (plants, trees and
audio; player physics, input and targeting), so they can be built side by side. Then B's design
session and build, then Phase 17 leading with the Stone Caverns' structures. C fits in anywhere.

### A. World fixes

Done: merged into `develop` in [#27](https://github.com/Swalliso/dig-deep/pull/27) on 2026-10-20.

- **P1-15**: a due plant that has no room starts its timer again (a fresh random time). A sapling
  needs spacing from other trunks and saplings (Terraria keeps three empty tiles between
  saplings), checked plant by plant within the growth pass.
- **P1-04** (decided): saplings only grow under open sky. A stronger grow light may count later;
  torches don't. Spores keep growing in the dark. The sapling's tooltip and F3 say why it's
  waiting.
- **P1-05**: felling takes only the leaves (or cap) nearer the felled trunk than any other trunk.
- **P1-08** (moved from B, since it's the rope fix): when the tile under a rope's end opens up,
  the rope unrolls into the new air, up to its spare length.
- **P1-01**: reproduce the audio problem, then fix the gain staging (a limiter on the master
  rather than a 12:1 compressor), keep the ambience out of the effects' compression, and give
  ambient events their own voice budget. Needs a listening check by us.
- Tests for plant growth (banking, spacing, sky) and felling with overlapping canopies.

### B. Early game and the ore economy

**The problem**, from both rounds: after the stone pickaxe, the surest way to find ore is to strip
mine in one direction. Ore is scarce and comes in small amounts, and the rate never improves.
Coal feeds both bars and torches, so light runs short exactly when exploring. Scouting a drop is
costly (flares burn out; ropes are short and can't be joined), so players jump in and build
platforms back up.

**The goal**: exploring caves beats strip mining. Caves are where ore shows, light is affordable,
drops can be scouted, and what you find grows as you progress.

1. **Measure**: a fresh world with no debug mode (most of our own testing has used debug mode,
   which skips the early game): time to each pickaxe, torches and coal used, and how each vein
   was found. Plus a generation stats test: open space and cavern sizes per stratum, and ore per
   stratum and how much of it touches a cave.
2. **Design session**: pick levers, not all of them. My lean is marked ★.
   - World (new generation, so a new profile):
     - ★ More and larger caverns, especially in the Stone Caverns, and some cave mouths at the
       surface so the first trip down can follow a cave.
     - ★ Ore biased onto cave walls (P1-13).
     - Coal in deeper strata too, rarer.
     - Larger veins, or occasional rich ones, deeper down.
   - Supplies and tools (no generation change):
     - **Charcoal** (decided): a furnace turns wood into charcoal, which works as coal for
       torches (and maybe smelting). Wood grows back, so light does too.
     - Ropes: P1-08 (package A) is the fix we chose. Joining ropes and an easier-to-find depth
       readout stay options if drops deeper than 20 m still come up.
     - Scouting light: thrown torches (clicking out of reach throws the torch, and it sticks as
       a placed torch: permanent, established light), or cheaper flares.
     - Keep the map's 5-tile ore sense (P1-02), maybe with a way to widen it.
   - Growth (the "flat rate"):
     - ★ One mid-game vein tool that breaks a whole connected vein (Descent's Vein Miner as a
       Sandbox item), or yield that grows with pickaxe tier.
     - Cheaper bombs, or a lesser drill earlier.
     - Check the iron sinks, such as lift rails per bar.
3. **Write it into `ROADMAP.md`** as two slices, like 14a/14b (decided): B1 the world
   (generation) and B2 supplies and tools. Acceptance like "a fresh world reaches the iron pickaxe in N minutes
   without strip mining" and "a cave trip pays more than a tunnel of the same length".

**Then Phase 17** leads with the Stone Caverns' structures (abandoned mineshafts with a chest of
iron bars, torches and rope), so the early game gets loot, with loot tables balanced against B.
Loot is P2-01's answer to "crafting shouldn't be the only source of iron". Automation (ROADMAP's
"Ideas to brainstorm") stays the long-term answer to scaling up; B shouldn't pre-empt it.

### C. Readability and art

- **P1-06**: more value contrast between the Fungal Hollows' backdrop and its tiles, and a weaker or
  tighter glowshroom tint.
- **P1-07**: wall and ceiling torch sprites, picked at draw time from the torch's neighbours.
- Before-and-after screenshots of every stratum, with Reduced flashes on too.

### D. Wishlist

P1-10 glowshroom cultivation (may join B as a renewable light), P1-11 stairs (ROADMAP's
"Building comfort").

### E. Movement and targeting controls

Done: merged into `develop` in [#28](https://github.com/Swalliso/dig-deep/pull/28) on 2026-10-20.

- **P1-14**: a **careful** action (Shift by default) in the action table: no auto step-up while
  it's held. It doesn't stop you walking off ledges (decided).
- **P1-09**: ladders and ropes catch a walk-off only once the fall passes 3 tiles (decided, to
  try out); W or S still grab any time.
- **P2-04** (decided): a smart cursor like Terraria's. While it's on, the game picks the target
  near the cursor and outlines it: the pickaxe digs the nearest diggable tile toward the cursor
  within reach, and a held block goes in the nearest legal spot toward the cursor. It's a switch
  on the Settings screen (per device), an accessibility option rather than an item, since it's
  about aiming, not progress. No Ctrl key: a page can't block Ctrl+W, so pressing Ctrl while
  holding W to climb can close the tab. A toggle key can come with the remapping screen.
- Key hints and the Controls screen come from the action table as usual.

## Decisions

Open:

1. **P1-03**: keep "lit on screen means seen on the map" through rock (lean yes)? And how do
   Phase 17's lit structures avoid showing through fog before they're found? (Settle in B.)

Made (2026-10-20):

- **P1-04**: saplings need sky light; a stronger grow light may count later, torches don't.
- **B before Phase 17**, split into B1 (the world) and B2 (supplies and tools).
- **P2-02**: charcoal from wood, rather than more torches per coal.
- **P2-03**: ropes unrolling into new air (P1-08) mostly solves the rope problem; it moves to A.
- **P1-09**: try catching a walk-off only after 3 tiles of fall.
- **P1-14**: careful walking doesn't stop you walking off ledges.
- **P2-04**: the smart cursor is a Settings switch, and smart digging takes the nearest diggable
  tile toward the cursor.

## Round 1 – 2026-10-19

- **Build**: the dev site at Phase 16 (rope coils were in it). Played a new world down through
  the Fungal Hollows. Seed and browser weren't recorded (see "Questions for the tester").
- **The tester's headline**: the ore economy. Ore is hard to find and comes in small amounts,
  and nothing makes getting it faster or easier: a flat rate from start to finish. Caverns also
  feel too few and too small.

### Summary

| ID | Item | Kind | Package | Status |
| --- | --- | --- | --- | --- |
| P1-01 | Audio crackles; ambience drops out under other sounds | Bug | A | done ([#27](https://github.com/Swalliso/dig-deep/pull/27)) |
| P1-02 | Map reveals ore a little past what you can see (and the tester relies on it) | Design | B | keep |
| P1-03 | Glowshroom caves show on the map through solid rock | Design | B | open |
| P1-04 | Trees grow deep underground in the dark | Bug | A | done ([#27](https://github.com/Swalliso/dig-deep/pull/27)) |
| P1-05 | Felling a tree strips leaves off its neighbours | Bug | A | done ([#27](https://github.com/Swalliso/dig-deep/pull/27)) |
| P1-06 | Fungal Hollows: backdrop blends into tiles; glowshroom haze washes over everything | Tuning | C | planned |
| P1-07 | Torches on walls and ceilings should look attached there | Request | C | planned |
| P1-08 | Rope ladders don't unroll further when the ground under them is dug out | Request | A | done ([#27](https://github.com/Swalliso/dig-deep/pull/27)) |
| P1-09 | Ladders and ropes grab you without pressing up or down | Tuning | E | done ([#28](https://github.com/Swalliso/dig-deep/pull/28)) |
| P1-10 | A way to cultivate glowshrooms | Request | D | open |
| P1-11 | Stairs or half-tile pieces for decoration | Request | D | open |
| P1-12 | **Too little ore, small amounts, no way to speed it up** | Design | B | open |
| P1-13 | Too few, too small caverns; ore could favour cavern edges | Design | B | open |
| P1-14 | A way to stop the auto step-up (hold Shift?) when shaving off a layer | Request | E | done ([#28](https://github.com/Swalliso/dig-deep/pull/28)) |
| P1-15 | Saplings bank their growth time, then grow all at once and side by side | Bug | A | done ([#27](https://github.com/Swalliso/dig-deep/pull/27)) |

### Findings

**P1-01 Audio crackles; ambience drops out under other sounds.** Bug. Done in [#27](https://github.com/Swalliso/dig-deep/pull/27).
- *Seen*: crackling, and the stratum ambience cuts out while other sounds play (felling a tree,
  mining).
- *Cause (likely, confirm by ear)*: every sound, ambience included, goes through one
  `DynamicsCompressor` on the master bus at its default settings (−24 dB threshold, 12:1 ratio,
  3 ms attack; `createContext` in `audio/sfx.ts`). A burst of loud effects clamps the whole mix,
  so the ambience bed ducks with it, and a 3 ms attack on low drones can distort. Ambient events
  also share the 32-voice cap (`SFX_MAX_VOICES`) with effects, so a felled tree can crowd them out.
- *Call*: package A. Reproduce first (fell a tree in the Stone Caverns, dig fast in the Hollows),
  then fix the gain staging; listen on speakers and headphones.

**P1-02 Map reveals ore a little past what you can see.** Design, keep.
- *Seen*: the map shows coal and ore slightly further away than the screen does. The tester uses
  this to find ore, and says it feels like the right difficulty *with* it.
- *Cause*: the map marks every tile within `EXPLORE_RADIUS` (5 tiles) of the player as seen, lit
  or not and through rock (`ExploredMap.look`), while the player glow only lights about 3 tiles.
  That's the Phase 10 fog-of-war rule working as written; it was never framed as ore-finding.
- *Call*: keep it, and make it a deliberate part of finding ore in package B. Don't "fix" it
  without a replacement, or ore gets harder to find.

**P1-03 Glowshroom caves show on the map through solid rock.** Design, open.
- *Seen*: within about a screen of glowshrooms, their cave appears on the map, through any amount
  of rock.
- *Cause*: the map also marks every *lit* tile on screen, and light has no line of sight: the
  screen itself draws a glowshroom-lit cave behind 50 m of rock. The map matches the screen.
- *Call (lean)*: keep it. Glowing caves seen from afar are a lure that helps discovery, which is
  what P1-12 needs. To settle: Phase 17 says undiscovered structures mustn't show through fog, so
  lit structures (a lost camp's torch) would break that unless their lights are out until found;
  and whether the map should only mark tiles lit brightly enough to read, not at light level 1.

**P1-04 Trees grow deep underground in the dark.** Bug. Done in [#27](https://github.com/Swalliso/dig-deep/pull/27).
- *Seen*: a sapling planted far underground grew into a tree in a pitch-black cave.
- *Cause*: a sapling only needs grass or dirt under it and headroom (`plants.ts`); there's no
  light check, and dirt can be placed anywhere.
- *Call* (decided 2026-10-20): saplings need sky light. A stronger grow light may count later;
  torches don't. Giant mushroom spores keep growing in the dark, so trees stay the surface's wood
  and mushrooms the underground's.

**P1-05 Felling a tree strips leaves off its neighbours.** Bug. Done in [#27](https://github.com/Swalliso/dig-deep/pull/27).
- *Seen*: cutting one tree of a close group removes the leaves of the others too.
- *Cause*: `fellTreeAbove` flood-fills leaves up to `TREE_FELL_RADIUS` (3) columns from the
  trunk, so canopies that touch come down together, leaving the neighbours bare.
- *Call*: package A: take only the leaves nearer the felled trunk than any other (same for giant
  mushroom caps). Test with two trees whose canopies overlap.

**P1-06 Fungal Hollows readability.** Tuning.
- *Seen*: the Hollows feel a bit too dark: the background blends into the tiles, worst near a
  glowshroom, whose teal glow hazes over everything.
- *Cause*: the Hollows backdrop (`#111916` plus parallax layers) sits close in value to mudstone,
  and the coloured glow adds up to `GLOW_TINT_STRENGTH` (0.45) of teal over `GLOW_TINT_RADIUS`
  (6 tiles), on tiles and backdrop alike.
- *Call*: package C, an art pass, not a light-rule change: more value contrast between backdrop
  and tiles (a darker or less saturated backdrop, or edge shading on tiles that face open air),
  and a weaker or tighter tint, perhaps tinting the backdrop less than the tiles.

**P1-07 Torches on walls and ceilings.** Request.
- *Seen*: a torch placed on a wall or ceiling still looks like it's standing on a floor.
- *Cause*: torches can already go against any side (`canPlace` accepts a neighbour on any side);
  there's one sprite.
- *Call*: package C: pick the sprite at draw time from what's next to it (floor, left wall, right
  wall, ceiling). No new tile ids, no save change.

**P1-08 Rope ladders don't unroll further.** Request. Done in [#27](https://github.com/Swalliso/dig-deep/pull/27).
- *Seen*: digging out the ground under a hanging rope doesn't let the rest of it drop.
- *Cause*: a coil unrolls once, up to `ROPE_LENGTH` (20 tiles), stopping at the floor. The slack
  isn't lost (rolling up gives back one coil per 20 tiles, rounded up), so a rope of length L has
  `ceil(L / 20) × 20 − L` tiles to spare.
- *Call* (decided 2026-10-20; it's the fix for P2-03 too): package A: when the tile under a
  rope's end opens up, unroll into the new air, up to the spare length, through the active tile
  updates. No new saved state.

**P1-09 Ladders and ropes grab you without pressing up or down.** Tuning. Done in [#28](https://github.com/Swalliso/dig-deep/pull/28).
- *Seen*: walking past a ladder or rope sometimes latches on; the first time it felt like a bug.
- *Cause*: Phase 11b's rule: walking off a ledge into a ladder column catches you, so walking
  sideways into a shaft isn't a long fall. Since Phase 16, ropes hang in more places, so stepping
  down any small ledge next to one catches you.
- *Call* (decided 2026-10-20, to try out): package E: keep the safety net but only for real
  falls: catch once the fall has passed 3 tiles (well under the 12-tile damage height), not on a one-step drop. W or S
  still grab any time. Keep Phase 11b's check passing: walking into a ladder shaft from the side
  catches you.

**P1-10 Cultivate glowshrooms.** Request, open.
- *Seen*: the tester wants to grow glowshrooms.
- *Now*: glowshrooms can be mined and placed again (Phase 14b's "a lit route through the Hollows
  is grown rather than torched"), but they never multiply, so the supply is whatever generation
  made.
- *Call*: fits the game well. Options: glowshrooms slowly spread to nearby mudstone in the dark,
  or drop spores that grow like the giant mushroom's. Decide alongside B, since it's a renewable
  resource with real value (healing light).

**P1-11 Stairs or half-tile pieces.** Request, open.
- *Seen*: the tester wants small stair segments for looks.
- *Call*: wishlist, under ROADMAP's "Building comfort" (decorative variants). Real stairs or
  half tiles change collision in `player.ts`, so they're not small; a "stair" that's a full tile
  with a stepped look would be cheap but only cosmetic, since auto step-up already climbs
  one-tile steps.

**P1-12 Too little ore, small amounts, no way to speed it up.** Design, open. The headline.
- *Seen*: ore is hard to find, each find is small, and the rate never improves.
- *Numbers today* (strata worlds):
  - A pickaxe is 10 bars: 30 ore, 10 coal and 5 wood. A vein is 3–8 ore, one per 450 (coal) to
    1,100 (emberite) tiles of its band (gems rarer still), so a pickaxe takes about 5–6 veins.
  - Iron's sinks since Phases 15–16: the pickaxe (10 bars), a 300 m lift with three stops (22),
    the camp (2), the lantern (2), the helmet (3), the claws (4), the spring boots (3) and the
    magnet charm (2): about 48 bars, 145 iron ore, 26 veins, and 48 coal from the Stone Caverns.
  - Pickaxe tiers only add speed and access; nothing raises yield. The only accelerators are
    bombs (3 x 3, an iron bar and 4 coal for 3) and the drill, which needs emberite, so it only
    arrives at the end.
- *Call*: package B.

**P1-13 Too few, too small caverns; ore on cavern edges.** Design, open.
- *Seen*: more and bigger caverns would help find ore; ore could favour cavern edges.
- *Now*: caves are noise-carved with a threshold that eases from 0.55 near the surface to 0.28 at
  the bottom; the Geode Depths add around a dozen huge caverns. Ore veins are placed in rock with
  no regard for nearby air.
- *Call*: package B. Changing caves or ore placement is new generation, so it goes in a new
  profile for new worlds; existing worlds keep theirs.

**P1-14 A way to stop the auto step-up.** Request. Done in [#28](https://github.com/Swalliso/dig-deep/pull/28).
- *Seen*: when shaving off one layer while walking and mining, the step-up lifts you onto the
  ledge you're trying to remove. (We hit this too in round 2.)
- *Now*: walking into a one-tile ledge always steps up (`Player.moveX`). Shift does nothing in
  the world outside debug mode (it's the inventory's shift-click), and Ctrl isn't bound at all.
- *Call*: package E: a **careful** action (Shift by default): no step-up while it's held.

**P1-15 Saplings bank growth time.** Bug. Done in [#27](https://github.com/Swalliso/dig-deep/pull/27).
- *Seen*: plant saplings close together, fell the ones that grew, and the rest grow at once,
  even right next to each other.
- *Cause*: a plant's grow time is fixed when it's planted. Once it's due it waits for room and
  grows the moment it has some, however long it waited. `growDuePlants` grows every due plant in
  one pass, and a tree only checks its own trunk column and fills open air with leaves, so
  neighbouring saplings all grow.
- *Call*: package A: restart the timer of a due plant with no room, and require spacing, checked
  plant by plant within the pass. Tests for both.

### Questions for the tester

- Which browser and device, and speakers or headphones when the audio crackled?
- The world's seed (on the Worlds screen), so we can look at the same caves.
- Roughly how long to each pickaxe, and which upgrade felt the slowest?
- Did you find and use bombs or the drill?

## Round 2 – 2026-10-20

- **Build**: `develop` at Phase 16, played by us. Most of our testing so far has used debug mode,
  which skips the early game, so this round looks at the early game, and package B starts by
  playing it properly.
- **Headline**: after the stone pickaxe, exploring means strip mining in one direction until
  enough ore turns up. Several points repeat round 1 (P1-12, P1-13, P1-14).

### Summary

| ID | Item | Kind | Package | Status |
| --- | --- | --- | --- | --- |
| P2-01 | Early exploration is just strip mining; want bigger caverns or structures with loot | Design | B | open |
| P2-02 | Coal is limited, but torches need it, so light runs out while exploring | Design | B | planned |
| P2-03 | Ropes are hard to use, since you can't tell how deep a drop is; flares cost too much | Design | A, B | ropes done ([#27](https://github.com/Swalliso/dig-deep/pull/27)); light planned |
| P2-04 | A smart cursor like Terraria's (Ctrl) that targets a tile near you | Request | E | done ([#28](https://github.com/Swalliso/dig-deep/pull/28)) |

### Findings

**P2-01 Early exploration is just strip mining.** Design, open.
- *Seen*: once you have the stone pickaxe, ore is hard to find, so you dig in one direction and
  hope. The early loop needs more than that: bigger caverns, or abandoned structures with chests,
  so crafting isn't the only way to get things that need iron (which many recipes use).
- *Now*: the same causes as P1-12 and P1-13. There are no structures yet; they're Phase 17.
- *Call*: package B, then Phase 17 leading with the Stone Caverns' structures.

**P2-02 Coal for torches.** Design.
- *Seen*: coal is limited and torches need it, so you run out of light while exploring.
- *Now*: coal is only in the Stone Caverns (one vein per 450 tiles, 3–8 coal). A coal and a wood
  make 4 torches, and coal is also the fuel for every bar, flares (2 coal and a torch for 2),
  bombs (4 coal for 3) and the drill. A new game starts with 10 torches.
- *Call* (decided 2026-10-20): package B2: charcoal from wood; maybe coal deeper down too (B1).

**P2-03 Ropes, and scouting a drop.** Design. The rope fix (P1-08) is done in [#27](https://github.com/Swalliso/dig-deep/pull/27); scouting light stays with B.
- *Seen*: you can't tell how deep a cavern is, so you jump down and build platforms to get back
  up instead of using a rope. A flare would show the bottom, but flares are expensive and burn
  out, so you don't want to craft or use them.
- *Now*: aiming a rope coil already shows the rope's length and the drop below its end, up to
  60 m ("Rope ladder: 20 m, the drop goes on past its end"), but only while a coil is held and
  aimed at a spot in reach. A rope can't hang from another rope (rope isn't an anchor), so a drop
  past 20 m can't be roped. Flares burn for 30 s.
- *Call* (decided 2026-10-20): ropes unrolling into new air (P1-08, package A) mostly solves it.
  Cheaper scouting light (thrown torches or cheaper flares) stays an option for B2, and joining
  ropes one if drops deeper than 20 m still come up.

**P2-04 Smart cursor.** Request. Done in [#28](https://github.com/Swalliso/dig-deep/pull/28).
- *Seen*: Terraria's Ctrl smart cursor, which targets a tile near you. It could be an item, or an
  accessibility option for now.
- *How Terraria does it* ([wiki](https://terraria.wiki.gg/wiki/Smart_Cursor)): Left Ctrl toggles
  it, and a setting makes it work only while Ctrl is held. The targeted tile is outlined in yellow,
  and the held item decides the target: a pickaxe digs a passage the player fits through toward
  the cursor, an axe chops the nearest tree's base, a block goes in the nearest legal space (and
  does nothing if the cursor's own tile is taken), platforms extend existing ones, and acorns are
  planted keeping three empty tiles between saplings.
- *Now*: we always target the tile under the cursor (`cursorTile` in `game.ts`), within reach.
  Every letter key is bound (counting debug keys); Ctrl isn't.
- *Call* (decided 2026-10-20): package E, as a Settings switch; smart digging takes the nearest
  diggable tile toward the cursor (see E for why not Ctrl).

## Template for the next round

```markdown
## Round N – YYYY-MM-DD

- **Build**: live or dev site, which phase. Seed, browser and device.
- **Headline**: the biggest point, in a sentence or two.

### Summary

| ID | Item | Kind | Package | Status |
| --- | --- | --- | --- | --- |

### Findings

**PN-01 Title.** Kind, status.
- *Seen*: what the tester ran into.
- *Now* or *Cause*: what the code does (file and function).
- *Call*: the package, and what we'll do or the decision needed.
```
