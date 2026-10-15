import type { Inventory } from './systems/inventory';
import type { ItemId } from './systems/items';

// Debug mode: add `debug` to the URL (`?seed=42&debug`) to turn on testing shortcuts.
// Keep every cheat in here so it's easy to see what the debug build can do.

export const DEBUG = new URLSearchParams(location.search).has('debug');

/** G gives the materials kit, F toggles fly mode, I cycles instant mining, L toggles lighting. */
export const DEBUG_KEYS = { give: 'KeyG', fly: 'KeyF', instantMine: 'KeyI', fullbright: 'KeyL' } as const;

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

/** Enough of every material to craft every recipe, plus both stations ready to place. */
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
];

/** Add the materials kit. Anything that doesn't fit is skipped. */
export function giveDebugKit(inventory: Inventory): void {
  for (const [item, count] of KIT) inventory.add(item, count);
}

export function debugHelpLines(flying: boolean, instantMine: InstantMine, fullbright: boolean): string[] {
  return [
    `DEBUG  G: give materials   L: lighting ${fullbright ? 'off (fullbright)' : 'on'}`,
    `       F: fly ${flying ? 'ON' : 'off'} (W/S or ↑/↓, Shift fast)   I: instant mine ${instantMine}`,
  ];
}
