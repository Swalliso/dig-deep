---
paths:
  - "src/world/generate.ts"
  - "src/world/strata.ts"
  - "src/world/world.ts"
  - "src/world/heat.ts"
  - "src/world/plants.ts"
  - "src/systems/heat.ts"
  - "src/systems/goal.ts"
  - "tests/generate.test.ts"
  - "tests/strata.test.ts"
  - "tests/profiles.test.ts"
  - "tests/rules.test.ts"
  - "tests/plants.test.ts"
---

# World generation and strata

- **Depth**: `depth = ty - SURFACE_LEVEL` (`SURFACE_LEVEL = 120`), so 1 tile = 1 m and 0 m is the
  average surface. Ore depth ranges in the spec use this depth. Deepstone starts at absolute row
  350, as the generation section says (in strata worlds, give or take its wander, that's where
  the Geode Depths start).
- **Generation profiles**: `generate.ts` has the frozen 'classic', 'gravel' and 'strata' v1
  profiles, and 'strata' v2 for new worlds. A profile must never change what it generates once
  released (tests pin classic's and gravel's world hashes): new generation goes in a new profile,
  and `NEW_WORLD_PROFILE` picks what new worlds get. Each save records its profile (see
  `.claude/rules/saves.md`).
- **Strata**: worlds made with the `strata` profile (every new world since Phase 14a) are five
  depth bands, `STRATA` in `world/strata.ts`: Topsoil, Stone Caverns, Fungal Hollows, Geode
  Depths, Magma Layer.
  - Each boundary wanders per column and is kept in `world.strataTops` (regenerated from the
    seed, never saved). `stratumAt(world, tx, ty)` says which stratum a tile is in, and -1 in
    worlds made with an older profile, which get no stratum banner, ambience or stratum backdrop
    either.
  - Each stratum has its own rock, and its ores (`OreSpec.stratum`) replace only that rock
    inside its boundaries. Each stratum's rock and ores need at most the pickaxe made from the
    strata above it, so there are no circular requirements (a test walks it).
- **Stratum rules** (Phase 14b; `Stratum.rule` names each on the banner):
  - Fungal Hollows: damp air dims torches (`torchLight`, used by the light map).
  - Geode Depths: near floatstone (in the caverns) gravity is lighter and falls are cushioned
    (`Player.floating`, set by the game each step).
  - Magma Layer: lava and hot rock make hot zones (`world/heat.ts`: heat spreads a level less per
    tile through anything that doesn't insulate; bricks, heartstone and closed doors do), which
    burn after a grace (`systems/heat.ts`). Lava is a liquid tile: walk-through, can't be dug or
    built in, hurts on touch, doesn't flow.
  - Strata v2 worlds (new since 14b; v1 is frozen) also have floatstone, hot rock, lava and the
    Heart of the Deep (`world.heart`, regenerated from the seed); breaking the Heart is the
    Sandbox's goal. Cozy worlds take no damage from any of it.
