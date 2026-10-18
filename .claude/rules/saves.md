---
paths:
  - "src/systems/save.ts"
  - "src/systems/backup.ts"
  - "tests/save.test.ts"
  - "tests/backup.test.ts"
  - "tests/profiles.test.ts"
---

# Saves in detail

- A save is the seed plus only the chunks changed since generation (the rest is regenerated),
  so **bump `SAVE_VERSION` in `systems/save.ts` whenever world generation, tile ids,
  chunk/world size or the save format change**; old saves then show "Save from an older version"
  instead of loading wrong.
- Optional fields need no version bump. Saved that way:
  - items lying on the ground (`drops`)
  - chest contents and other tile entities (`tileEntities`; planted saplings and mushroom sprouts
    are tile entities too, with the session clock time they grow)
  - the map's explored tiles (`explored`, per chunk, RLE)
  - the session clock (`playTime`)
  - cave-ins: shaking tiles, falling blocks and queued rechecks (`caveIns`), so a reload
    mid-collapse loses and duplicates nothing
  - dread (`dread`, in percent so autosave notices it) and burning flares (`flares`, with their
    time left)
  - the pinned recipe (`pinnedRecipe`, by the item it makes) and the map pins (`mapPins`)
  - when the Heart of the Deep was claimed (`heartClaimedAt`; the world list marks a claimed
    world)
  - lift cages (`lifts`, Phase 15), each parked where it was or where it was heading, and
    `respawnAt: 'camp'` when the camp was set as the respawn point after the bed; lift stop names
    and the camp (on its top-left tile) are tile entities
- A save made during a lift ride stores the player standing at the stop the ride ends at
  (`Game.savedPlayer`) and the cage there, so a reload mid-trip loads with the trip done.
- Not saved: particles, half-mined tile damage, the trash slot, and heat exposure (a reload
  starts its few seconds of grace again).
- A stack held on the mouse is saved as if put away; whatever doesn't fit is saved as a drop at
  the player, so saving never loses it.
- Autosave's change check compares `savedState()` (everything but tiles, map and play time) plus
  the world's and map's revisions, so new saved state goes in `savedState()`; a test enforces it.
- Save & quit only leaves once the write succeeds.
- Backups (`systems/backup.ts`) are the save as JSON with Uint8Arrays as `{ "$bytes": base64 }`;
  imports must pass `checkSave` and `findSaveProblem` before anything is written, and replacing a
  world needs a second click.
- Each world is a slot: its save under `saveKeyFor(id)` (world 1 keeps the original
  `dig-deep:save` key so older saves carry over) plus a small `WorldMeta` entry written with it in
  one transaction, so the title screen lists worlds without loading every save.
- Each save records its world's **generation profile** (`profile`: name and version; missing =
  classic) and loading regenerates with it, so existing worlds never pick up new generation. A
  profile this version doesn't know reads as a save from a newer version. See
  `.claude/rules/world-gen.md` for the profile rules.
- Keeping old worlds working is nice but never a constraint (testers know breaking changes may
  come): when it would hold a feature back, bump `SAVE_VERSION` instead. See ROADMAP.md's "World
  compatibility" row.
