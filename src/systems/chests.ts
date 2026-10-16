import { CHEST_SLOTS, DEPOSIT_ALL_HOTBAR, HOTBAR_SIZE, QUICK_STACK_HOTBAR } from '../config';
import type { ChestData, TileEntities } from '../world/tileEntities';
import { Tile } from '../world/tiles';
import type { World } from '../world/world';
import { forEachTileInRange } from './crafting';
import { addToSlots, type Inventory, type Slots } from './inventory';
import type { ItemId } from './items';

/** A chest's contents (stored as the chest tile's entity). */
export type Chest = ChestData;

export function createChest(): Chest {
  return { kind: 'chest', slots: new Array(CHEST_SLOTS).fill(null) };
}

/**
 * The chest at (tx, ty), or null if that tile isn't a chest. A chest tile with no data yet
 * (one just placed) gets an empty chest.
 */
export function chestAt(world: World, entities: TileEntities, tx: number, ty: number): Chest | null {
  if (world.getTile(tx, ty) !== Tile.Chest) return null;
  const existing = entities.get(tx, ty);
  if (existing?.kind === 'chest') return existing;
  const chest = createChest();
  entities.set(tx, ty, chest);
  return chest;
}

/** Chests with a tile centre within STATION_RANGE tiles of world point (x, y), nearest first. */
export function nearbyChests(world: World, entities: TileEntities, x: number, y: number): Chest[] {
  const found: { chest: Chest; distance: number }[] = [];
  forEachTileInRange(world, x, y, (tx, ty, tile, distance) => {
    if (tile !== Tile.Chest) return;
    const chest = chestAt(world, entities, tx, ty);
    if (chest) found.push({ chest, distance });
  });
  // Stable sort, so equally near chests keep the scan's order (top row first).
  return found.sort((a, b) => a.distance - b.distance).map((f) => f.chest);
}

/** Loot all: move every chest stack into the inventory, as far as there's room. Returns items moved. */
export function lootAll(chest: Chest, inventory: Inventory): number {
  let moved = 0;
  chest.slots.forEach((stack, i) => {
    if (stack) moved += moveStack(chest.slots, i, (item, count) => inventory.add(item, count));
  });
  return moved;
}

/** Deposit all: move every bag stack into the chest (the hotbar too if DEPOSIT_ALL_HOTBAR). Returns items moved. */
export function depositAll(inventory: Inventory, chest: Chest): number {
  return moveInto(inventory, chest, DEPOSIT_ALL_HOTBAR ? 0 : HOTBAR_SIZE, () => true);
}

/**
 * Quick stack: move only the items the chest already holds, topping up its stacks first and
 * then filling its empty slots. Covers the hotbar too if QUICK_STACK_HOTBAR. Returns items moved.
 */
export function quickStack(inventory: Inventory, chest: Chest): number {
  const held = new Set(chest.slots.flatMap((s) => (s ? [s.item] : [])));
  return moveInto(inventory, chest, QUICK_STACK_HOTBAR ? 0 : HOTBAR_SIZE, (item) => held.has(item));
}

/** Quick stack into each chest in turn (nearest first). Returns items moved and how many chests took some. */
export function quickStackAll(inventory: Inventory, chests: readonly Chest[]): { moved: number; chests: number } {
  let moved = 0;
  let used = 0;
  for (const chest of chests) {
    const n = quickStack(inventory, chest);
    moved += n;
    if (n > 0) used++;
  }
  return { moved, chests: used };
}

/** Shift-click on inventory slot `index` while a chest is open: move that stack into the chest. */
export function moveToChest(inventory: Inventory, index: number, chest: Chest): void {
  moveStack(inventory.slots, index, (item, count) => addToSlots(chest.slots, item, count));
}

/** Shift-click on chest slot `index`: move that stack into the inventory. */
export function moveToInventory(chest: Chest, index: number, inventory: Inventory): void {
  moveStack(chest.slots, index, (item, count) => inventory.add(item, count));
}

function moveInto(inventory: Inventory, chest: Chest, from: number, wanted: (item: ItemId) => boolean): number {
  let moved = 0;
  for (let i = from; i < inventory.slots.length; i++) {
    const stack = inventory.slots[i];
    if (stack && wanted(stack.item)) moved += moveStack(inventory.slots, i, (item, count) => addToSlots(chest.slots, item, count));
  }
  return moved;
}

/** Hand slot `index`'s stack to `put`, which returns how many it couldn't take. Returns how many moved. */
function moveStack(slots: Slots, index: number, put: (item: ItemId, count: number) => number): number {
  const stack = slots[index];
  if (!stack) return 0;
  const left = put(stack.item, stack.count);
  const moved = stack.count - left;
  if (left === 0) slots[index] = null;
  else stack.count = left;
  return moved;
}
