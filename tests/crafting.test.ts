import { describe, expect, it } from 'vitest';
import { CRAFT_MANY, MAX_STACK, PICKAXES, STATION_RANGE, TILE_SIZE } from '../src/config';
import { Player } from '../src/entities/player';
import { chestAt, createChest, nearbyChests } from '../src/systems/chests';
import {
  availableCount,
  canCraft,
  craft,
  craftTimes,
  missingIngredients,
  nearbyStations,
  RECIPE_GROUPS,
  RECIPES,
  type Station,
} from '../src/systems/crafting';
import { Inventory } from '../src/systems/inventory';
import type { ItemId } from '../src/systems/items';
import { checkMine } from '../src/systems/mining';
import { TileEntities } from '../src/world/tileEntities';
import { Tile } from '../src/world/tiles';
import { World } from '../src/world/world';

const NONE = new Set<Station>();
const ALL = new Set<Station>(['workbench', 'furnace']);
const recipeFor = (item: ItemId) => RECIPES.find((r) => r.output === item)!;
const centre = (t: number) => (t + 0.5) * TILE_SIZE;

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
      ['4 stone_bricks', '4 stone', 'furnace'], // Phase 14a
      ['4 mudstone_bricks', '4 mudstone', 'furnace'], // Phase 14a
      ['4 deepstone_bricks', '4 deepstone', 'furnace'], // Phase 14a
      ['4 basalt_bricks', '4 basalt', 'furnace'], // Phase 14a
      ['1 workbench', '10 planks', 'none'],
      ['4 torch', '1 wood + 1 coal', 'none'],
      ['2 ruby_lamp', '1 gold_bar + 1 ruby', 'workbench'], // Phase 14a
      ['2 sapphire_lamp', '1 gold_bar + 1 sapphire', 'workbench'], // Phase 14a
      ['1 furnace', '20 stone', 'workbench'],
      ['1 stone_pickaxe', '15 stone + 5 wood', 'workbench'],
      ['1 copper_bar', '3 copper_ore + 1 coal', 'furnace'],
      ['1 copper_pickaxe', '10 copper_bar + 5 wood', 'workbench'],
      ['1 iron_bar', '3 iron_ore + 1 coal', 'furnace'],
      ['1 iron_pickaxe', '10 iron_bar + 5 wood', 'workbench'],
      ['1 gold_bar', '3 gold_ore + 1 coal', 'furnace'],
      ['1 gold_pickaxe', '10 gold_bar + 5 wood', 'workbench'],
      ['1 emberite_bar', '3 emberite_ore + 1 coal', 'furnace'], // Phase 14a
      ['1 emberite_pickaxe', '10 emberite_bar + 5 wood', 'workbench'], // Phase 14a
      ['1 lantern', '2 iron_bar + 1 torch', 'workbench'], // Phase 13
      ['2 flare', '1 torch + 2 coal', 'workbench'], // Phase 13
      ['1 chest', '8 planks', 'workbench'],
      ['2 beam', '1 planks', 'none'], // Phase 12
      ['2 crossbeam', '1 planks', 'none'], // Phase 12
      ['4 ladder', '3 planks', 'workbench'],
      ['2 platform', '1 planks', 'workbench'],
      ['1 door', '6 planks', 'workbench'],
      ['1 bed', '10 planks + 4 wood', 'workbench'], // Phase 11b
      ['16 lift_rail', '1 iron_bar + 2 planks', 'workbench'], // Phase 15
      ['1 lift_stop', '1 iron_bar + 4 planks', 'workbench'], // Phase 15
      ['1 camp_kit', '1 workbench + 1 furnace + 1 bed + 2 iron_bar', 'workbench'], // Phase 15
      ['3 bomb', '1 iron_bar + 4 coal', 'workbench'], // Phase 16
      ['1 rope_coil', '5 planks', 'workbench'], // Phase 16
      ['1 drill', '8 emberite_bar + 4 iron_bar', 'workbench'], // Phase 16
      ['1 miner_helmet', '3 iron_bar + 2 torch', 'workbench'], // Phase 16
      ['1 toolbelt', '4 copper_bar + 6 planks', 'workbench'], // Phase 16
      ['1 magnet_charm', '2 iron_bar + 2 sapphire', 'workbench'], // Phase 16
      ['1 long_grip', '3 gold_bar + 6 wood', 'workbench'], // Phase 16
      ['1 spring_boots', '3 iron_bar + 4 floatstone', 'workbench'], // Phase 16
      ['1 padded_boots', '2 copper_bar + 8 planks', 'workbench'], // Phase 16
      ['1 heat_ward', '2 gold_bar + 2 ruby', 'workbench'], // Phase 16
      ['1 climbing_claws', '4 iron_bar + 2 wood', 'workbench'], // Phase 16
    ]);
  });

  it('sorts every recipe into a group', () => {
    const byGroup = Object.fromEntries(RECIPE_GROUPS.map((g) => [g, RECIPES.filter((r) => r.group === g).map((r) => r.output)]));
    expect(byGroup).toEqual({
      blocks: ['planks', 'stone_bricks', 'mudstone_bricks', 'deepstone_bricks', 'basalt_bricks', 'beam', 'crossbeam', 'ladder', 'platform', 'door', 'lift_rail'],
      light: ['torch', 'ruby_lamp', 'sapphire_lamp', 'lantern', 'flare'],
      tools: ['stone_pickaxe', 'copper_pickaxe', 'iron_pickaxe', 'gold_pickaxe', 'emberite_pickaxe', 'bomb', 'rope_coil', 'drill'],
      gear: ['miner_helmet', 'toolbelt', 'magnet_charm', 'long_grip', 'spring_boots', 'padded_boots', 'heat_ward', 'climbing_claws'],
      materials: ['copper_bar', 'iron_bar', 'gold_bar', 'emberite_bar'],
      stations: ['workbench', 'furnace', 'chest', 'bed', 'lift_stop', 'camp_kit'],
    });
  });

  it(`shift-click crafts ${CRAFT_MANY} batches, or as many as there are ingredients for`, () => {
    const inv = invWith({ wood: 25 });
    expect(craftTimes(inv, recipeFor('planks'), NONE, [], CRAFT_MANY)).toBe(CRAFT_MANY);
    expect(inv.count('planks')).toBe(4 * CRAFT_MANY);
    expect(inv.count('wood')).toBe(25 - CRAFT_MANY);
    expect(craftTimes(inv, recipeFor('planks'), NONE, [], CRAFT_MANY)).toBe(CRAFT_MANY);
    expect(craftTimes(inv, recipeFor('planks'), NONE, [], CRAFT_MANY)).toBe(5);
    expect(inv.count('wood')).toBe(0);
    expect(craftTimes(inv, recipeFor('planks'), NONE, [], CRAFT_MANY)).toBe(0);
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
  it(`finds a workbench or furnace within ${STATION_RANGE} tiles`, () => {
    expect(nearbyStations(worldWith(Tile.Workbench, 20 + STATION_RANGE, 20), centre(20), centre(20))).toEqual(new Set(['workbench']));
    expect(nearbyStations(worldWith(Tile.Furnace, 20, 20 - STATION_RANGE), centre(20), centre(20))).toEqual(new Set(['furnace']));
  });

  it(`ignores stations farther than ${STATION_RANGE} tiles`, () => {
    expect(nearbyStations(worldWith(Tile.Workbench, 20 + STATION_RANGE + 1, 20), centre(20), centre(20)).size).toBe(0);
    expect(nearbyStations(worldWith(Tile.Workbench, 20 + 3, 20 + 3), centre(20), centre(20)).size).toBe(0);
  });
});

describe('crafting from nearby chests', () => {
  it('uses ingredients split between the inventory and a chest 3 tiles away', () => {
    const world = new World(40, 40, 0);
    world.setTile(23, 20, Tile.Chest);
    world.setTile(19, 20, Tile.Workbench);
    const entities = new TileEntities(world);
    chestAt(world, entities, 23, 20)!.slots[4] = { item: 'stone', count: 12 };
    const x = centre(20);
    const y = centre(20);
    const chests = nearbyChests(world, entities, x, y);
    expect(chests).toHaveLength(1);

    const inv = invWith({ stone: 5, wood: 5 });
    const pickaxe = recipeFor('stone_pickaxe');
    const stations = nearbyStations(world, x, y);
    expect(canCraft(inv, pickaxe, stations)).toBe(false); // not enough stone carried
    expect(availableCount(inv, 'stone', chests)).toBe(17);
    expect(missingIngredients(inv, pickaxe, chests)).toEqual([]);
    expect(craft(inv, pickaxe, stations, chests)).toBe(true);
    // The carried stone went first, then 10 from the chest.
    expect(inv.count('stone_pickaxe')).toBe(1);
    expect(inv.count('stone')).toBe(0);
    expect(inv.count('wood')).toBe(0);
    expect(chests[0].slots[4]).toEqual({ item: 'stone', count: 2 });
  });

  it('ignores chests out of range', () => {
    const world = new World(40, 40, 0);
    world.setTile(20 + STATION_RANGE + 1, 20, Tile.Chest);
    const entities = new TileEntities(world);
    chestAt(world, entities, 20 + STATION_RANGE + 1, 20)!.slots[0] = { item: 'wood', count: 5 };
    expect(nearbyChests(world, entities, centre(20), centre(20))).toEqual([]);
  });

  it('puts the chests back as they were when the output does not fit', () => {
    const inv = new Inventory();
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = { item: 'dirt', count: MAX_STACK };
    const chest = createChest();
    chest.slots[0] = { item: 'wood', count: 1 };
    chest.slots[1] = { item: 'coal', count: 1 };
    expect(craft(inv, recipeFor('torch'), NONE, [chest])).toBe(false);
    expect(chest.slots.slice(0, 2)).toEqual([
      { item: 'wood', count: 1 },
      { item: 'coal', count: 1 },
    ]);
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
