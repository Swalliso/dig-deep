import { STATION_RANGE, TILE_SIZE } from '../config';
import { Tile } from '../world/tiles';
import type { World } from '../world/world';
import type { Inventory } from './inventory';
import type { ItemId } from './items';

export type Station = 'workbench' | 'furnace';

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
}

const recipe = (output: ItemId, count: number, station: Station | null, ...ingredients: [ItemId, number][]): Recipe => ({
  output,
  count,
  station,
  ingredients: ingredients.map(([item, n]) => ({ item, count: n })),
});

export const RECIPES: readonly Recipe[] = [
  recipe('planks', 4, null, ['wood', 1]),
  recipe('workbench', 1, null, ['planks', 10]),
  recipe('torch', 4, null, ['wood', 1], ['coal', 1]),
  recipe('furnace', 1, 'workbench', ['stone', 20]),
  recipe('stone_pickaxe', 1, 'workbench', ['stone', 15], ['wood', 5]),
  recipe('copper_bar', 1, 'furnace', ['copper_ore', 3], ['coal', 1]),
  recipe('copper_pickaxe', 1, 'workbench', ['copper_bar', 10], ['wood', 5]),
  recipe('iron_bar', 1, 'furnace', ['iron_ore', 3], ['coal', 1]),
  recipe('iron_pickaxe', 1, 'workbench', ['iron_bar', 10], ['wood', 5]),
  recipe('gold_bar', 1, 'furnace', ['gold_ore', 3], ['coal', 1]),
  recipe('gold_pickaxe', 1, 'workbench', ['gold_bar', 10], ['wood', 5]),
];

const STATION_TILES: Record<Station, number> = { workbench: Tile.Workbench, furnace: Tile.Furnace };

/** Stations with a tile centre within STATION_RANGE tiles of world point (x, y). */
export function nearbyStations(world: World, x: number, y: number): Set<Station> {
  const found = new Set<Station>();
  const tx0 = Math.floor(x / TILE_SIZE);
  const ty0 = Math.floor(y / TILE_SIZE);
  const range = STATION_RANGE * TILE_SIZE;
  for (let ty = ty0 - STATION_RANGE - 1; ty <= ty0 + STATION_RANGE + 1; ty++) {
    for (let tx = tx0 - STATION_RANGE - 1; tx <= tx0 + STATION_RANGE + 1; tx++) {
      const tile = world.getTile(tx, ty);
      for (const station of ['workbench', 'furnace'] as const) {
        if (tile !== STATION_TILES[station]) continue;
        const dx = (tx + 0.5) * TILE_SIZE - x;
        const dy = (ty + 0.5) * TILE_SIZE - y;
        if (dx * dx + dy * dy <= range * range) found.add(station);
      }
    }
  }
  return found;
}

/** Ingredients the inventory is short of, with how many are missing. */
export function missingIngredients(inventory: Inventory, recipe: Recipe): Ingredient[] {
  return recipe.ingredients
    .map(({ item, count }) => ({ item, count: count - inventory.count(item) }))
    .filter((m) => m.count > 0);
}

export function canCraft(inventory: Inventory, recipe: Recipe, stations: ReadonlySet<Station>): boolean {
  return (recipe.station === null || stations.has(recipe.station)) && missingIngredients(inventory, recipe).length === 0;
}

/**
 * Craft one batch: take the ingredients and add the output to the inventory. Returns false,
 * changing nothing, if it can't be crafted or the output wouldn't fit.
 */
export function craft(inventory: Inventory, recipe: Recipe, stations: ReadonlySet<Station>): boolean {
  if (!canCraft(inventory, recipe, stations)) return false;
  const backup = inventory.slots.map((s) => s && { ...s });
  for (const { item, count } of recipe.ingredients) inventory.remove(item, count);
  if (inventory.add(recipe.output, recipe.count) > 0) {
    backup.forEach((s, i) => (inventory.slots[i] = s));
    return false;
  }
  return true;
}
