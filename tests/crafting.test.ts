import { describe, expect, it } from 'vitest';
import { MAX_STACK, PICKAXES, STATION_RANGE, TILE_SIZE } from '../src/config';
import { Player } from '../src/entities/player';
import { canCraft, craft, missingIngredients, nearbyStations, RECIPES, type Station } from '../src/systems/crafting';
import { Inventory } from '../src/systems/inventory';
import type { ItemId } from '../src/systems/items';
import { checkMine } from '../src/systems/mining';
import { Tile } from '../src/world/tiles';
import { World } from '../src/world/world';

const NONE = new Set<Station>();
const ALL = new Set<Station>(['workbench', 'furnace']);
const recipeFor = (item: ItemId) => RECIPES.find((r) => r.output === item)!;

function invWith(items: Partial<Record<ItemId, number>>): Inventory {
  const inv = new Inventory();
  for (const [item, count] of Object.entries(items)) inv.add(item as ItemId, count ?? 0);
  return inv;
}

describe('recipes', () => {
  it('match the spec table', () => {
    const table = RECIPES.map((r) => [
      `${r.count} ${r.output}`,
      r.ingredients.map((i) => `${i.count} ${i.item}`).join(' + '),
      r.station ?? 'none',
    ]);
    expect(table).toEqual([
      ['4 planks', '1 wood', 'none'],
      ['1 workbench', '10 planks', 'none'],
      ['4 torch', '1 wood + 1 coal', 'none'],
      ['1 furnace', '20 stone', 'workbench'],
      ['1 stone_pickaxe', '15 stone + 5 wood', 'workbench'],
      ['1 copper_bar', '3 copper_ore + 1 coal', 'furnace'],
      ['1 copper_pickaxe', '10 copper_bar + 5 wood', 'workbench'],
      ['1 iron_bar', '3 iron_ore + 1 coal', 'furnace'],
      ['1 iron_pickaxe', '10 iron_bar + 5 wood', 'workbench'],
      ['1 gold_bar', '3 gold_ore + 1 coal', 'furnace'],
      ['1 gold_pickaxe', '10 gold_bar + 5 wood', 'workbench'],
    ]);
  });

  it('crafts planks, a workbench and torches with no station', () => {
    const inv = invWith({ wood: 4, coal: 1 });
    expect(craft(inv, recipeFor('planks'), NONE)).toBe(true);
    expect(craft(inv, recipeFor('planks'), NONE)).toBe(true);
    expect(craft(inv, recipeFor('planks'), NONE)).toBe(true);
    expect(inv.count('planks')).toBe(12);
    expect(craft(inv, recipeFor('workbench'), NONE)).toBe(true);
    expect(craft(inv, recipeFor('torch'), NONE)).toBe(true);
    expect(inv.count('workbench')).toBe(1);
    expect(inv.count('torch')).toBe(4);
    expect(inv.count('wood')).toBe(0);
    expect(inv.count('planks')).toBe(2);
  });

  it('needs the right station nearby', () => {
    const inv = invWith({ stone: 20, copper_ore: 3, coal: 1 });
    expect(canCraft(inv, recipeFor('furnace'), NONE)).toBe(false);
    expect(canCraft(inv, recipeFor('furnace'), new Set(['furnace']))).toBe(false);
    expect(canCraft(inv, recipeFor('furnace'), new Set(['workbench']))).toBe(true);
    expect(canCraft(inv, recipeFor('copper_bar'), new Set(['workbench']))).toBe(false);
    expect(canCraft(inv, recipeFor('copper_bar'), new Set(['furnace']))).toBe(true);
  });

  it('lists exactly what is missing and changes nothing when short', () => {
    const inv = invWith({ stone: 15, wood: 2 });
    expect(missingIngredients(inv, recipeFor('stone_pickaxe'))).toEqual([{ item: 'wood', count: 3 }]);
    expect(craft(inv, recipeFor('stone_pickaxe'), ALL)).toBe(false);
    expect(inv.count('stone')).toBe(15);
    expect(inv.count('wood')).toBe(2);
  });

  it('refuses to craft when the output would not fit, changing nothing', () => {
    const inv = new Inventory();
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = { item: 'dirt', count: MAX_STACK };
    // 2 of each, so using one of each frees no slot for the torches.
    inv.slots[0] = { item: 'wood', count: 2 };
    inv.slots[1] = { item: 'coal', count: 2 };
    expect(craft(inv, recipeFor('torch'), NONE)).toBe(false);
    expect(inv.slots[0]).toEqual({ item: 'wood', count: 2 });
    expect(inv.slots[1]).toEqual({ item: 'coal', count: 2 });
  });
});

describe('stations', () => {
  function worldWith(tile: number, tx: number, ty: number): World {
    const world = new World(40, 40, 0);
    world.setTile(tx, ty, tile as typeof Tile.Workbench);
    return world;
  }
  const centre = (t: number) => (t + 0.5) * TILE_SIZE;

  it(`finds a workbench or furnace within ${STATION_RANGE} tiles`, () => {
    expect(nearbyStations(worldWith(Tile.Workbench, 20 + STATION_RANGE, 20), centre(20), centre(20))).toEqual(new Set(['workbench']));
    expect(nearbyStations(worldWith(Tile.Furnace, 20, 20 - STATION_RANGE), centre(20), centre(20))).toEqual(new Set(['furnace']));
  });

  it(`ignores stations farther than ${STATION_RANGE} tiles`, () => {
    expect(nearbyStations(worldWith(Tile.Workbench, 20 + STATION_RANGE + 1, 20), centre(20), centre(20)).size).toBe(0);
    expect(nearbyStations(worldWith(Tile.Workbench, 20 + 3, 20 + 3), centre(20), centre(20)).size).toBe(0);
  });
});

describe('pickaxe progression', () => {
  it('goes Wooden → Stone → Copper → Iron, each one unlocking the next ore', () => {
    const world = new World(40, 40, 0);
    for (let x = 0; x < 40; x++) world.setTile(x, 30, Tile.Stone);
    const player = new Player(20, 29);
    const canMine = (inv: Inventory, tile: number) => {
      world.setTile(21, 30, tile as typeof Tile.Stone);
      return checkMine(world, player, 21, 30, inv.bestPickaxeTier()) === 'ok';
    };

    const inv = Inventory.withStartingItems();
    expect(canMine(inv, Tile.CopperOre)).toBe(false);

    // Gathered with the wooden pickaxe: wood from trees, stone and coal underground.
    inv.add('wood', 18);
    inv.add('stone', 35);
    inv.add('coal', 20);
    for (let i = 0; i < 3; i++) expect(craft(inv, recipeFor('planks'), NONE)).toBe(true);
    expect(craft(inv, recipeFor('workbench'), NONE)).toBe(true);
    expect(craft(inv, recipeFor('stone_pickaxe'), new Set(['workbench']))).toBe(true);
    expect(craft(inv, recipeFor('furnace'), new Set(['workbench']))).toBe(true);
    expect(PICKAXES[inv.bestPickaxeTier()].name).toBe('Stone');
    expect(canMine(inv, Tile.CopperOre)).toBe(true);
    expect(canMine(inv, Tile.IronOre)).toBe(false);

    inv.add('copper_ore', 30);
    for (let i = 0; i < 10; i++) expect(craft(inv, recipeFor('copper_bar'), new Set(['furnace']))).toBe(true);
    expect(craft(inv, recipeFor('copper_pickaxe'), new Set(['workbench']))).toBe(true);
    expect(PICKAXES[inv.bestPickaxeTier()].name).toBe('Copper');
    expect(canMine(inv, Tile.IronOre)).toBe(true);
    expect(canMine(inv, Tile.Deepstone)).toBe(true);
    expect(canMine(inv, Tile.GoldOre)).toBe(false);

    inv.add('iron_ore', 30);
    for (let i = 0; i < 10; i++) expect(craft(inv, recipeFor('iron_bar'), new Set(['furnace']))).toBe(true);
    expect(craft(inv, recipeFor('iron_pickaxe'), new Set(['workbench']))).toBe(true);
    expect(PICKAXES[inv.bestPickaxeTier()].name).toBe('Iron');
    expect(canMine(inv, Tile.GoldOre)).toBe(true);
  });
});
