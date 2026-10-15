import type { Inventory } from './systems/inventory';
import type { ItemId } from './systems/items';

// Debug mode: add `debug` to the URL (`?seed=42&debug`) to turn on testing shortcuts.
// Keep every cheat in here so it's easy to see what the debug build can do.

export const DEBUG = new URLSearchParams(location.search).has('debug');

/** Key that gives the materials kit, and key that toggles fly mode. */
export const DEBUG_KEYS = { give: 'KeyG', fly: 'KeyF' } as const;

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

export function debugHelpLine(flying: boolean): string {
  return `DEBUG  G: give materials   F: fly ${flying ? 'ON' : 'off'} (W/S or ↑/↓, Shift fast)`;
}
