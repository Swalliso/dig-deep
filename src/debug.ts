import type { Inventory } from './systems/inventory';
import type { ItemId } from './systems/items';
import { ORE_TILES, Tile } from './world/tiles';
import type { World } from './world/world';

// Debug mode: add `debug` to the URL (`?seed=42&debug`) to turn on testing shortcuts.
// Keep every cheat in here so it's easy to see what the debug build can do.

export const DEBUG = new URLSearchParams(location.search).has('debug');

/**
 * G gives the materials kit, F toggles fly mode, I cycles instant mining, L toggles lighting,
 * O puts a patch of every ore at the cursor, K digs a ladder shaft down from the cursor, and V
 * reveals the whole map.
 */
export const DEBUG_KEYS = {
  give: 'KeyG',
  fly: 'KeyF',
  instantMine: 'KeyI',
  fullbright: 'KeyL',
  ores: 'KeyO',
  ladderShaft: 'KeyK',
  revealMap: 'KeyV',
} as const;

/** Length of the ladder shaft K digs. */
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
 * Enough of every material to craft every recipe, plus both stations, some chests and a stack
 * of ladders, platforms and doors ready to place.
 */
const KIT: ReadonlyArray<[ItemId, number]> = [
  ['wood', 99],
  ['stone', 200],
  ['coal', 99],
  ['copper_ore', 99],
  ['iron_ore', 99],
  ['gold_ore', 99],
  ['dirt', 200],
  ['torch', 50],
  ['workbench', 1],
  ['furnace', 1],
  ['chest', 3],
  ['ladder', 200],
  ['platform', 100],
  ['door', 3],
];

/** Add the materials kit. Anything that doesn't fit is skipped. */
export function giveDebugKit(inventory: Inventory): void {
  for (const [item, count] of KIT) inventory.add(item, count);
}

/**
 * Ore sampler: a 4 x 2 patch of coal, copper, iron and gold (one column each) with its top-left
 * at (tx, ty), replacing whatever is there except bedrock. For trying ore sounds and glints
 * without digging down to them.
 */
export function placeOreSampler(world: World, tx: number, ty: number): void {
  for (let dy = 0; dy < 2; dy++) {
    ORE_TILES.forEach((ore, dx) => {
      if (world.getTile(tx + dx, ty + dy) !== Tile.Bedrock) world.setTile(tx + dx, ty + dy, ore);
    });
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

export function debugHelpLines(flying: boolean, instantMine: InstantMine, fullbright: boolean): string[] {
  return [
    `DEBUG  G: give materials   L: lighting ${fullbright ? 'off (fullbright)' : 'on'}`,
    `       F: fly ${flying ? 'ON' : 'off'} (W/S or ↑/↓, Shift fast)   I: instant mine ${instantMine}`,
    '       O: ore patch at the cursor   K: 100 m ladder shaft down from the cursor   V: reveal the map',
  ];
}
