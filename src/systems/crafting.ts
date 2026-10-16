import { STATION_RANGE, TILE_SIZE } from '../config';
import { Tile, type TileId } from '../world/tiles';
import type { World } from '../world/world';
import type { Chest } from './chests';
import { copySlots, type Inventory } from './inventory';
import type { ItemId } from './items';

export type Station = 'workbench' | 'furnace';

/** Where a recipe is listed in the crafting panel. */
export type RecipeGroup = 'blocks' | 'tools' | 'materials' | 'stations';

export const RECIPE_GROUPS: readonly RecipeGroup[] = ['blocks', 'tools', 'materials', 'stations'];

export interface Ingredient {
  item: ItemId;
  count: number;
}

export interface Recipe {
  output: ItemId;
  count: number;
  ingredients: Ingredient[];
  /** Station that must be within STATION_RANGE tiles, or null for none. */
  station: Station | null;
  group: RecipeGroup;
}

const recipe = (
  group: RecipeGroup,
  output: ItemId,
  count: number,
  station: Station | null,
  ...ingredients: [ItemId, number][]
): Recipe => ({
  output,
  count,
  station,
  group,
  ingredients: ingredients.map(([item, n]) => ({ item, count: n })),
});

export const RECIPES: readonly Recipe[] = [
  recipe('blocks', 'planks', 4, null, ['wood', 1]),
  recipe('stations', 'workbench', 1, null, ['planks', 10]),
  recipe('blocks', 'torch', 4, null, ['wood', 1], ['coal', 1]),
  recipe('stations', 'furnace', 1, 'workbench', ['stone', 20]),
  recipe('tools', 'stone_pickaxe', 1, 'workbench', ['stone', 15], ['wood', 5]),
  recipe('materials', 'copper_bar', 1, 'furnace', ['copper_ore', 3], ['coal', 1]),
  recipe('tools', 'copper_pickaxe', 1, 'workbench', ['copper_bar', 10], ['wood', 5]),
  recipe('materials', 'iron_bar', 1, 'furnace', ['iron_ore', 3], ['coal', 1]),
  recipe('tools', 'iron_pickaxe', 1, 'workbench', ['iron_bar', 10], ['wood', 5]),
  recipe('materials', 'gold_bar', 1, 'furnace', ['gold_ore', 3], ['coal', 1]),
  recipe('tools', 'gold_pickaxe', 1, 'workbench', ['gold_bar', 10], ['wood', 5]),
  recipe('stations', 'chest', 1, 'workbench', ['planks', 8]),
  recipe('blocks', 'ladder', 4, 'workbench', ['planks', 3]),
  recipe('blocks', 'platform', 2, 'workbench', ['planks', 1]),
  recipe('blocks', 'door', 1, 'workbench', ['planks', 6]),
];

const STATION_TILES: Record<Station, number> = { workbench: Tile.Workbench, furnace: Tile.Furnace };

/**
 * Visit every tile whose centre is within STATION_RANGE tiles of world point (x, y), row by
 * row from the top, with its distance in px.
 */
export function forEachTileInRange(
  world: World,
  x: number,
  y: number,
  visit: (tx: number, ty: number, tile: TileId, distance: number) => void,
): void {
  const tx0 = Math.floor(x / TILE_SIZE);
  const ty0 = Math.floor(y / TILE_SIZE);
  const range = STATION_RANGE * TILE_SIZE;
  for (let ty = ty0 - STATION_RANGE - 1; ty <= ty0 + STATION_RANGE + 1; ty++) {
    for (let tx = tx0 - STATION_RANGE - 1; tx <= tx0 + STATION_RANGE + 1; tx++) {
      const distance = Math.hypot((tx + 0.5) * TILE_SIZE - x, (ty + 0.5) * TILE_SIZE - y);
      if (distance <= range) visit(tx, ty, world.getTile(tx, ty), distance);
    }
  }
}

/** Stations with a tile centre within STATION_RANGE tiles of world point (x, y). */
export function nearbyStations(world: World, x: number, y: number): Set<Station> {
  const found = new Set<Station>();
  forEachTileInRange(world, x, y, (_tx, _ty, tile) => {
    for (const station of ['workbench', 'furnace'] as const) if (tile === STATION_TILES[station]) found.add(station);
  });
  return found;
}

/** How many of an item the chests hold between them. */
function chestCount(chests: readonly Chest[], item: ItemId): number {
  let n = 0;
  for (const chest of chests) for (const s of chest.slots) if (s && s.item === item) n += s.count;
  return n;
}

/** Take `count` of an item out of the chests, nearest chest first. The caller checks there are enough. */
function takeFromChests(chests: readonly Chest[], item: ItemId, count: number): void {
  for (const chest of chests) {
    for (let i = chest.slots.length - 1; i >= 0 && count > 0; i--) {
      const stack = chest.slots[i];
      if (!stack || stack.item !== item) continue;
      const taken = Math.min(count, stack.count);
      stack.count -= taken;
      count -= taken;
      if (stack.count === 0) chest.slots[i] = null;
    }
  }
}

/** How many of an item crafting can use: what's carried plus what's in the nearby chests. */
export function availableCount(inventory: Inventory, item: ItemId, chests: readonly Chest[] = []): number {
  return inventory.count(item) + chestCount(chests, item);
}

/** Ingredients the inventory (plus nearby chests) is short of, with how many are missing. */
export function missingIngredients(inventory: Inventory, recipe: Recipe, chests: readonly Chest[] = []): Ingredient[] {
  return recipe.ingredients
    .map(({ item, count }) => ({ item, count: count - availableCount(inventory, item, chests) }))
    .filter((m) => m.count > 0);
}

export function canCraft(inventory: Inventory, recipe: Recipe, stations: ReadonlySet<Station>, chests: readonly Chest[] = []): boolean {
  return (recipe.station === null || stations.has(recipe.station)) && missingIngredients(inventory, recipe, chests).length === 0;
}

/**
 * Craft one batch: take the ingredients (from the inventory first, then the nearby chests)
 * and add the output to the inventory. Returns false, changing nothing, if it can't be crafted
 * or the output wouldn't fit.
 */
export function craft(inventory: Inventory, recipe: Recipe, stations: ReadonlySet<Station>, chests: readonly Chest[] = []): boolean {
  if (!canCraft(inventory, recipe, stations, chests)) return false;
  const backup = copySlots(inventory.slots);
  const chestBackups = chests.map((c) => copySlots(c.slots));
  for (const { item, count } of recipe.ingredients) {
    const carried = Math.min(count, inventory.count(item));
    inventory.remove(item, carried);
    takeFromChests(chests, item, count - carried);
  }
  if (inventory.add(recipe.output, recipe.count) > 0) {
    backup.forEach((s, i) => (inventory.slots[i] = s));
    chests.forEach((c, n) => chestBackups[n].forEach((s, i) => (c.slots[i] = s)));
    return false;
  }
  return true;
}

/** Craft up to `times` batches, stopping at the first that can't be made. Returns how many were made. */
export function craftTimes(
  inventory: Inventory,
  recipe: Recipe,
  stations: ReadonlySet<Station>,
  chests: readonly Chest[],
  times: number,
): number {
  let made = 0;
  while (made < times && craft(inventory, recipe, stations, chests)) made++;
  return made;
}
