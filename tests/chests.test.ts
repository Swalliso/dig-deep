import { describe, expect, it } from 'vitest';
import { CHEST_SLOTS, HOTBAR_SIZE, MAX_STACK, STATION_RANGE, TILE_SIZE } from '../src/config';
import {
  chestAt,
  createChest,
  depositAll,
  lootAll,
  moveToChest,
  moveToInventory,
  nearbyChests,
  quickStack,
  quickStackAll,
  type Chest,
} from '../src/systems/chests';
import { Inventory } from '../src/systems/inventory';
import { LightMap } from '../src/world/lighting';
import { TileEntities, type TileEntity } from '../src/world/tileEntities';
import { Tile } from '../src/world/tiles';
import { World } from '../src/world/world';

const centre = (t: number) => (t + 0.5) * TILE_SIZE;

function chestWith(...stacks: [string, number][]): Chest {
  const chest = createChest();
  stacks.forEach(([item, count], i) => (chest.slots[i] = { item: item as never, count }));
  return chest;
}

describe('tile entities', () => {
  it('are removed (and reported) when their tile changes', () => {
    const world = new World(40, 40, 0);
    world.setTile(10, 12, Tile.Chest);
    const entities = new TileEntities(world);
    const removed: [number, number, TileEntity][] = [];
    entities.onRemove = (tx, ty, entity) => removed.push([tx, ty, entity]);
    const chest = chestAt(world, entities, 10, 12)!;
    chest.slots[0] = { item: 'coal', count: 7 };
    expect(entities.get(10, 12)).toBe(chest);

    world.setTile(11, 12, Tile.Stone); // a neighbour changing leaves it alone
    expect(entities.get(10, 12)).toBe(chest);
    world.setTile(10, 12, Tile.Air);
    expect(entities.get(10, 12)).toBeUndefined();
    expect(entities.size).toBe(0);
    expect(removed).toEqual([[10, 12, chest]]);

    // A new chest on the same spot starts empty.
    world.setTile(10, 12, Tile.Chest);
    expect(chestAt(world, entities, 10, 12)!.slots.every((s) => s === null)).toBe(true);
  });

  it('share tile changes with lighting', () => {
    // A sealed cave with a chest in it; swapping the chest for a torch must reach both listeners.
    const world = new World(40, 40, 0);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) world.setTile(x, y, Tile.Stone);
    for (let x = 18; x <= 22; x++) world.setTile(x, 30, Tile.Air);
    world.setTile(20, 30, Tile.Chest);
    const entities = new TileEntities(world);
    const light = new LightMap(world);
    chestAt(world, entities, 20, 30);
    expect(light.level(20, 30)).toBe(0);
    world.setTile(20, 30, Tile.Torch);
    light.update();
    expect(entities.size).toBe(0);
    expect(light.level(20, 30)).toBeGreaterThan(0);
  });

  it('only exist on chest tiles', () => {
    const world = new World(40, 40, 0);
    const entities = new TileEntities(world);
    expect(chestAt(world, entities, 3, 3)).toBeNull();
    expect(entities.size).toBe(0);
  });

  it('list themselves top row first', () => {
    const world = new World(40, 40, 0);
    const entities = new TileEntities(world);
    for (const [tx, ty] of [[30, 9], [2, 20], [5, 9]]) {
      world.setTile(tx, ty, Tile.Chest);
      chestAt(world, entities, tx, ty);
    }
    expect(entities.entries().map(({ tx, ty }) => [tx, ty])).toEqual([[5, 9], [30, 9], [2, 20]]);
  });
});

describe('chest storage', () => {
  it(`holds ${CHEST_SLOTS} slots`, () => {
    expect(createChest().slots).toHaveLength(CHEST_SLOTS);
  });

  it('quick stack moves only the items the chest already holds', () => {
    const inv = new Inventory();
    inv.slots[0] = { item: 'wooden_pickaxe', count: 1 };
    inv.slots[2] = { item: 'stone', count: 30 };
    inv.slots[3] = { item: 'dirt', count: 50 };
    inv.slots[HOTBAR_SIZE + 4] = { item: 'stone', count: 12 };
    inv.slots[HOTBAR_SIZE + 5] = { item: 'coal', count: 6 };
    const chest = chestWith(['stone', 5], ['coal', MAX_STACK]);

    expect(quickStack(inv, chest)).toBe(30 + 12 + 6);
    expect(inv.count('stone')).toBe(0);
    expect(inv.count('coal')).toBe(0);
    expect(inv.count('dirt')).toBe(50);
    expect(inv.count('wooden_pickaxe')).toBe(1);
    // Topped up its own stack, then the full coal stack overflowed into an empty slot.
    expect(chest.slots[0]).toEqual({ item: 'stone', count: 47 });
    expect(chest.slots[1]).toEqual({ item: 'coal', count: MAX_STACK });
    expect(chest.slots[2]).toEqual({ item: 'coal', count: 6 });
    expect(chest.slots.filter(Boolean)).toHaveLength(3);
  });

  it('quick stack moves nothing into an empty chest', () => {
    const inv = Inventory.withStartingItems();
    inv.add('dirt', 20);
    const chest = createChest();
    expect(quickStack(inv, chest)).toBe(0);
    expect(chest.slots.every((s) => s === null)).toBe(true);
  });

  it('deposit all empties the bag but leaves the hotbar', () => {
    const inv = Inventory.withStartingItems();
    inv.slots[HOTBAR_SIZE] = { item: 'dirt', count: 10 };
    inv.slots[HOTBAR_SIZE + 7] = { item: 'iron_ore', count: 4 };
    const chest = createChest();
    expect(depositAll(inv, chest)).toBe(14);
    expect(inv.slots.slice(HOTBAR_SIZE).every((s) => s === null)).toBe(true);
    expect(inv.count('wooden_pickaxe')).toBe(1);
    expect(inv.count('torch')).toBe(10);
    expect(chest.slots.slice(0, 2)).toEqual([
      { item: 'dirt', count: 10 },
      { item: 'iron_ore', count: 4 },
    ]);
  });

  it('deposit all keeps what does not fit', () => {
    const inv = new Inventory();
    inv.slots[HOTBAR_SIZE] = { item: 'dirt', count: 10 };
    const chest = createChest();
    chest.slots.fill({ item: 'stone', count: MAX_STACK });
    chest.slots[CHEST_SLOTS - 1] = { item: 'dirt', count: MAX_STACK - 4 };
    expect(depositAll(inv, chest)).toBe(4);
    expect(inv.slots[HOTBAR_SIZE]).toEqual({ item: 'dirt', count: 6 });
  });

  it('loot all takes everything that fits', () => {
    const inv = new Inventory();
    inv.add('coal', 3);
    const chest = chestWith(['coal', 10], ['gold_bar', 2]);
    expect(lootAll(chest, inv)).toBe(12);
    expect(inv.slots[0]).toEqual({ item: 'coal', count: 13 });
    expect(inv.count('gold_bar')).toBe(2);
    expect(chest.slots.every((s) => s === null)).toBe(true);

    const full = new Inventory();
    full.slots.fill({ item: 'dirt', count: MAX_STACK });
    const left = chestWith(['stone', 5]);
    expect(lootAll(left, full)).toBe(0);
    expect(left.slots[0]).toEqual({ item: 'stone', count: 5 });
  });

  it('shift-click moves a stack between the inventory and the chest', () => {
    const inv = new Inventory();
    inv.slots[3] = { item: 'planks', count: 30 };
    const chest = chestWith(['planks', 5]);
    moveToChest(inv, 3, chest);
    expect(inv.slots[3]).toBeNull();
    expect(chest.slots[0]).toEqual({ item: 'planks', count: 35 });
    moveToInventory(chest, 0, inv);
    expect(chest.slots[0]).toBeNull();
    expect(inv.slots[0]).toEqual({ item: 'planks', count: 35 });
  });
});

describe('chests nearby', () => {
  function worldWithChests(...spots: [number, number][]) {
    const world = new World(40, 40, 0);
    for (const [tx, ty] of spots) world.setTile(tx, ty, Tile.Chest);
    return { world, entities: new TileEntities(world) };
  }

  it(`finds chests within ${STATION_RANGE} tiles, nearest first`, () => {
    const { world, entities } = worldWithChests([20 + STATION_RANGE, 20], [20 - 2, 20], [20 + STATION_RANGE + 1, 20], [23, 23]);
    const found = nearbyChests(world, entities, centre(20), centre(20));
    expect(found).toEqual([chestAt(world, entities, 18, 20), chestAt(world, entities, 20 + STATION_RANGE, 20)]);
  });

  it('quick stack to every nearby chest fills the nearest first', () => {
    const { world, entities } = worldWithChests([22, 20], [17, 20]);
    const near = chestAt(world, entities, 22, 20)!;
    const far = chestAt(world, entities, 17, 20)!;
    near.slots.fill({ item: 'dirt', count: MAX_STACK });
    near.slots[0] = { item: 'stone', count: MAX_STACK - 10 };
    far.slots[0] = { item: 'stone', count: 1 };
    far.slots[1] = { item: 'coal', count: 1 };
    const inv = new Inventory();
    inv.add('stone', 25);
    inv.add('coal', 4);
    inv.add('dirt', 3);

    expect(quickStackAll(inv, nearbyChests(world, entities, centre(20), centre(20)))).toEqual({ moved: 25 + 4, chests: 2 });
    expect(near.slots[0]).toEqual({ item: 'stone', count: MAX_STACK });
    expect(far.slots[0]).toEqual({ item: 'stone', count: 16 });
    expect(far.slots[1]).toEqual({ item: 'coal', count: 5 });
    expect(inv.count('dirt')).toBe(3); // the near chest holds dirt but is full
  });
});
