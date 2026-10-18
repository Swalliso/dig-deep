import { DEBUG_STRATUM_SEARCH_COLUMNS, DEBUG_STRATUM_SEARCH_ROWS } from './config';
import type { Inventory } from './systems/inventory';
import type { ItemId } from './systems/items';
import { keyPairs, mainKey } from './ui/controls';
import { STRATA, stratumAt, stratumTopRow } from './world/strata';
import { isSolid, ORE_TILES, Tile } from './world/tiles';
import type { World } from './world/world';

// Debug mode: add `debug` to the URL (`?seed=42&debug`) to turn on testing shortcuts.
// Keep every cheat in here so it's easy to see what the debug build can do.

// (No `location` outside a browser: the unit tests import the helpers below.)
export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

/**
 * Debug-only switches. failSaves makes every save fail (the pause menu toggles it), so a failed
 * Save & Quit can be tried by hand. The cheat keys themselves are bound in input.ts's action
 * table (the debug* actions).
 */
export const debugState = { failSaves: false };

/** Length of the debug ladder shaft. */
export const LADDER_SHAFT_LENGTH = 100;

/**
 * Instant mining: 'off', one tile per tick under the cursor, or a 3x3 brush around it.
 * Reach and pickaxe-tier rules still apply, and bedrock stays unbreakable.
 */
export type InstantMine = 'off' | '1x1' | '3x3';

export function nextInstantMine(mode: InstantMine): InstantMine {
  return mode === 'off' ? '1x1' : mode === '1x1' ? '3x3' : 'off';
}

/** Offsets of the extra tiles the brush breaks around the cursor tile (none for 1x1). */
export function brushNeighbours(mode: InstantMine): [number, number][] {
  if (mode !== '3x3') return [];
  const offsets: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) offsets.push([dx, dy]);
  }
  return offsets;
}

/**
 * Enough of every material to craft every recipe, plus both stations, some chests, the dark's
 * kit (a lantern, flares, glowshrooms and glow crystals), saplings and spores to plant, gem lamps,
 * floatstone and a stack of ladders, platforms, doors, beds, gravel, beams and crossbeams ready to place.
 */
const KIT: ReadonlyArray<[ItemId, number]> = [
  // First, so they always fit.
  ['lantern', 1],
  ['flare', 20],
  ['glowshroom', 20],
  ['glow_crystal', 10],
  ['sapling', 10],
  ['mushroom_spores', 10],
  ['ruby_lamp', 6],
  ['sapphire_lamp', 6],
  ['floatstone', 10],
  ['wood', 99],
  ['stone', 200],
  ['coal', 99],
  ['copper_ore', 99],
  ['iron_ore', 99],
  ['gold_ore', 99],
  ['emberite_ore', 40],
  ['ruby', 10],
  ['sapphire', 10],
  ['mudstone', 60],
  ['deepstone', 60],
  ['basalt', 60],
  ['dirt', 200],
  ['torch', 50],
  ['workbench', 1],
  ['furnace', 1],
  ['chest', 3],
  ['ladder', 200],
  ['platform', 100],
  ['door', 3],
  ['bed', 2],
  ['gravel', 50],
  ['beam', 99],
  ['crossbeam', 99],
];

/** Add the materials kit. Anything that doesn't fit is skipped. */
export function giveDebugKit(inventory: Inventory): void {
  for (const [item, count] of KIT) inventory.add(item, count);
}

/**
 * Ore sampler: a patch two tiles tall of every ore and gem (coal, copper, iron, gold, ruby,
 * sapphire, emberite; one column each) with its top-left at (tx, ty), replacing whatever is
 * there except bedrock. For trying ore sounds and glints without digging down to them.
 */
export function placeOreSampler(world: World, tx: number, ty: number): void {
  for (let dy = 0; dy < 2; dy++) {
    ORE_TILES.forEach((ore, dx) => {
      if (world.getTile(tx + dx, ty + dy) !== Tile.Bedrock) world.setTile(tx + dx, ty + dy, ore);
    });
  }
}

/**
 * Gravel pocket: a 3 x 3 block of gravel with its bottom middle at (tx, ty), replacing whatever is
 * there except bedrock. In the open (or once the tile under it is dug out) it shakes and falls, to
 * try cave-ins; in rock it's a pocket to dig under.
 */
export function placeGravelPocket(world: World, tx: number, ty: number): void {
  for (let dy = -2; dy <= 0; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (world.getTile(tx + dx, ty + dy) !== Tile.Bedrock) world.setTile(tx + dx, ty + dy, Tile.Gravel);
    }
  }
}

/**
 * Ladder shaft: a column of ladders from (tx, ty) straight down for LADDER_SHAFT_LENGTH tiles,
 * replacing whatever is there, and stopping above bedrock. Returns how long it is.
 */
export function placeLadderShaft(world: World, tx: number, ty: number): number {
  let length = 0;
  while (length < LADDER_SHAFT_LENGTH && world.inBounds(tx, ty + length) && world.getTile(tx, ty + length) !== Tile.Bedrock) {
    world.setTile(tx, ty + length, Tile.Ladder);
    length++;
  }
  return length;
}

/** A spot the player fits in: the tile their feet are in (open, with the one above it open and solid ground under it). */
function fitsPlayer(world: World, tx: number, ty: number): boolean {
  return world.inBounds(tx, ty - 1) && !isSolid(world.getTile(tx, ty)) && !isSolid(world.getTile(tx, ty - 1)) && isSolid(world.getTile(tx, ty + 1));
}

/**
 * Where debug Y takes a player standing at tile (tx, ty): the top of the next stratum down, as
 * the tile their feet go in. It looks for open space within DEBUG_STRATUM_SEARCH_ROWS rows of
 * that stratum's top and DEBUG_STRATUM_SEARCH_COLUMNS columns of tx, nearest columns first, and
 * otherwise carves a two-tile pocket at the top in column tx. From the bottom stratum it goes back
 * to the world spawn. Null in a world without strata.
 */
export function nextStratumSpot(world: World, tx: number, ty: number): { tx: number; ty: number; stratum: number } | null {
  const here = stratumAt(world, tx, ty);
  if (here < 0) return null;
  const next = here + 1;
  if (next >= STRATA.length) return { tx: world.spawnTx, ty: world.spawnTy, stratum: stratumAt(world, world.spawnTx, world.spawnTy) };
  for (let d = 0; d <= DEBUG_STRATUM_SEARCH_COLUMNS; d++) {
    for (const x of d === 0 ? [tx] : [tx - d, tx + d]) {
      if (x < 1 || x > world.width - 2) continue;
      const top = stratumTopRow(world, next, x);
      for (let y = top + 1; y < top + DEBUG_STRATUM_SEARCH_ROWS; y++) {
        if (stratumAt(world, x, y - 1) === next && fitsPlayer(world, x, y)) return { tx: x, ty: y, stratum: next };
      }
    }
  }
  const top = stratumTopRow(world, next, tx);
  world.setTile(tx, top, Tile.Air);
  world.setTile(tx, top + 1, Tile.Air);
  return { tx, ty: top + 1, stratum: next };
}

/** Width of the debug lava pool. */
export const LAVA_POOL_WIDTH = 4;

/**
 * Lava pool: a row of LAVA_POOL_WIDTH lava tiles starting at (tx, ty), replacing whatever is
 * there except bedrock. For trying heat and insulation anywhere.
 */
export function placeLavaPool(world: World, tx: number, ty: number): void {
  for (let dx = 0; dx < LAVA_POOL_WIDTH; dx++) {
    if (world.getTile(tx + dx, ty) !== Tile.Bedrock) world.setTile(tx + dx, ty, Tile.Lava);
  }
}

/**
 * Where debug X takes the player: standing on the roof of the Heart of the Deep's chamber, as the
 * tile their feet go in (the chamber's cavern leaves room above it). Null without a Heart.
 */
export function heartSpot(world: World): { tx: number; ty: number } | null {
  const heart = world.heart;
  if (!heart) return null;
  const ty = heart.y0 - 1;
  world.setTile(heart.tx, ty, Tile.Air);
  world.setTile(heart.tx, ty - 1, Tile.Air);
  return { tx: heart.tx, ty };
}

export function debugHelpLines(flying: boolean, instantMine: InstantMine, fullbright: boolean, god: boolean): string[] {
  return [
    `DEBUG  ${mainKey('debugGive')}: give materials   ${mainKey('debugLighting')}: lighting ${fullbright ? 'off (fullbright)' : 'on'}`,
    `       ${mainKey('debugFly')}: fly ${flying ? 'ON' : 'off'} (${keyPairs('climbUp', 'climbDown', undefined, '/')}, ${mainKey('modifier')} fast)   ${mainKey('debugInstantMine')}: instant mine ${instantMine}`,
    `       ${mainKey('debugOres')}: ore patch at the cursor   ${mainKey('debugLadderShaft')}: ${LADDER_SHAFT_LENGTH} m ladder shaft down from the cursor   ${mainKey('debugRevealMap')}: reveal the map`,
    `       ${mainKey('debugGodMode')}: god mode ${god ? 'ON' : 'off'} (and heal)   ${mainKey('debugHurt')}: take 2 damage (fly up and turn fly off to test falls)`,
    `       ${mainKey('debugGravel')}: 3 x 3 gravel at the cursor (falls if nothing holds it up)   ${mainKey('debugDread')}: fill or empty dread`,
    `       ${mainKey('debugNextStratum')}: top of the next stratum (from the bottom one, back to spawn)   ${mainKey('debugGrowPlants')}: grow planted saplings and spores now`,
    `       ${mainKey('debugHeart')}: go to the Heart of the Deep   ${mainKey('debugLava')}: ${LAVA_POOL_WIDTH} lava tiles at the cursor`,
  ];
}
