import { describe, expect, it } from 'vitest';
import {
  GEAR_SLOTS,
  GRIP_REACH,
  HEAT_GRACE,
  HEAT_HURT_INTERVAL,
  HELMET_LIGHT,
  MAGNET_RANGE,
  PADDED_BOOTS_FALL,
  PLAYER_WIDTH,
  SAFE_FALL_TILES,
  SPRING_BOOTS_JUMP,
  TILE_SIZE,
  TOOLBELT_RANGE,
  WALL_SLIDE_SPEED,
} from '../src/config';
import { Player, type PlayerControls } from '../src/entities/player';
import { takeBag } from '../src/systems/death';
import { Heat } from '../src/systems/heat';
import { Inventory } from '../src/systems/inventory';
import { isAccessory, ITEM_IDS, type ItemId } from '../src/systems/items';
import { checkSave, createSave, restoreInventory } from '../src/systems/save';
import { BASE_STATS, computeStats, jumpHeight, statChanges, statLines, type PlayerStats } from '../src/systems/stats';
import { searchRecipes } from '../src/ui/menus';
import { Tile } from '../src/world/tiles';
import { World } from '../src/world/world';

const DT = 1 / 60;

function wearing(...items: ItemId[]): Inventory {
  const inventory = new Inventory();
  items.forEach((item, i) => (inventory.gear[i] = { item, count: 1 }));
  return inventory;
}

const statsWith = (...items: ItemId[]): PlayerStats => computeStats(wearing(...items).gearModifiers());

describe('accessories', () => {
  it('each change exactly the stat they say', () => {
    const changed = (item: ItemId): Partial<PlayerStats> => {
      const stats = statsWith(item);
      return Object.fromEntries(Object.entries(stats).filter(([key, value]) => BASE_STATS[key as keyof PlayerStats] !== value));
    };
    expect(changed('miner_helmet')).toEqual({ lightRadius: HELMET_LIGHT });
    expect(changed('toolbelt')).toEqual({ stationRange: BASE_STATS.stationRange + TOOLBELT_RANGE });
    expect(changed('magnet_charm')).toEqual({ dropPullRange: BASE_STATS.dropPullRange + MAGNET_RANGE });
    expect(changed('long_grip')).toEqual({ reach: BASE_STATS.reach + GRIP_REACH });
    expect(changed('spring_boots')).toEqual({ jumpVelocity: BASE_STATS.jumpVelocity + SPRING_BOOTS_JUMP });
    expect(changed('padded_boots')).toEqual({ safeFallTiles: SAFE_FALL_TILES + PADDED_BOOTS_FALL });
    expect(changed('heat_ward')).toEqual({ heatHurtInterval: HEAT_HURT_INTERVAL * 2 });
    expect(changed('climbing_claws')).toEqual({ wallGrip: 1 });
    expect(ITEM_IDS.filter(isAccessory)).toHaveLength(8);
  });

  it('add up, and the panel lists what they change', () => {
    const stats = statsWith('long_grip', 'toolbelt', 'spring_boots', 'miner_helmet');
    expect(stats.reach).toBe(BASE_STATS.reach + GRIP_REACH);
    expect(jumpHeight(stats)).toBeGreaterThan(jumpHeight(BASE_STATS) + 1.5);
    const lines = statLines(stats);
    expect(lines.filter((l) => l.changed).map((l) => l.label)).toEqual(['Reach', 'Stations', 'Jump', 'Light']);
    expect(lines.find((l) => l.label === 'Light')?.text).toBe(`${HELMET_LIGHT} tiles`);
    expect(statLines(BASE_STATS).every((l) => !l.changed)).toBe(true);
    expect(statChanges(BASE_STATS, statsWith('long_grip'))).toEqual([`reach ${BASE_STATS.reach} tiles → ${BASE_STATS.reach + GRIP_REACH} tiles`]);
  });
});

describe('gear slots', () => {
  it('take only accessories, one of each', () => {
    const inventory = new Inventory();
    expect(inventory.gear).toHaveLength(GEAR_SLOTS);
    inventory.cursor = { item: 'torch', count: 5 };
    expect(inventory.clickGear(0)).toBe('notGear');
    expect(inventory.cursor).toEqual({ item: 'torch', count: 5 });
    inventory.cursor = { item: 'toolbelt', count: 1 };
    expect(inventory.clickGear(0)).toBeNull();
    expect(inventory.gear[0]).toEqual({ item: 'toolbelt', count: 1 });
    inventory.cursor = { item: 'toolbelt', count: 1 };
    expect(inventory.clickGear(1)).toBe('wearing');
    // Swapping a slot for a different accessory, and taking one off onto the mouse.
    inventory.cursor = { item: 'heat_ward', count: 1 };
    expect(inventory.clickGear(0)).toBeNull();
    expect(inventory.gear[0]?.item).toBe('heat_ward');
    expect(inventory.cursor).toEqual({ item: 'toolbelt', count: 1 });
    inventory.cursor = null;
    inventory.clickGear(0);
    expect(inventory.cursor).toEqual({ item: 'heat_ward', count: 1 });
    expect(inventory.gear[0]).toBeNull();
  });

  it('shift-click wears from the inventory, and says why it can not', () => {
    const inventory = new Inventory();
    for (const item of ['toolbelt', 'long_grip', 'heat_ward', 'padded_boots', 'spring_boots', 'toolbelt', 'torch'] as ItemId[]) inventory.add(item, 1);
    expect(inventory.wearFromSlot(6)).toBe('notGear');
    for (let i = 0; i < 4; i++) expect(inventory.wearFromSlot(i)).toBeNull();
    expect(inventory.gear.map((s) => s?.item)).toEqual(['toolbelt', 'long_grip', 'heat_ward', 'padded_boots']);
    expect(inventory.wearFromSlot(5)).toBe('wearing'); // a second toolbelt
    expect(inventory.wearFromSlot(4)).toBe('full');
    expect(inventory.slots[4]?.item).toBe('spring_boots');
  });

  it('take off into the inventory only if there is room, so nothing is ever lost', () => {
    const inventory = wearing('magnet_charm');
    inventory.slots.fill(null).forEach((_, i) => (inventory.slots[i] = { item: 'dirt', count: 999 }));
    expect(inventory.takeOff(0)).toBe(false);
    expect(inventory.gear[0]?.item).toBe('magnet_charm');
    inventory.slots[7] = null;
    expect(inventory.takeOff(0)).toBe(true);
    expect(inventory.gear[0]).toBeNull();
    expect(inventory.slots[7]).toEqual({ item: 'magnet_charm', count: 1 });
  });

  it("aren't counted, crafted with or left in a satchel", () => {
    const inventory = wearing('climbing_claws');
    inventory.add('climbing_claws', 1);
    expect(inventory.count('climbing_claws')).toBe(1);
    inventory.slots[15] = { item: 'drill', count: 1 };
    inventory.slots[16] = { item: 'coal', count: 3 };
    const bag = takeBag(inventory);
    expect(bag).toEqual([{ item: 'coal', count: 3 }]); // the drill stays, like pickaxes
    expect(inventory.gear[0]?.item).toBe('climbing_claws');
  });

  it('are saved and loaded, dropping anything that is not wearable', () => {
    const world = new World(64, 64, 1);
    const inventory = wearing('miner_helmet', 'padded_boots');
    const save = structuredClone(createSave(world, new Player(2, 2), inventory, []));
    expect(checkSave(save).kind).toBe('ok');
    expect(restoreInventory(save).gear.map((s) => s?.item ?? null)).toEqual(['miner_helmet', 'padded_boots', null, null]);
    save.inventory.gear = [{ item: 'torch', count: 1 }, { item: 'toolbelt', count: 1 }, { item: 'toolbelt', count: 1 }, null];
    expect(restoreInventory(save).gear.map((s) => s?.item ?? null)).toEqual([null, 'toolbelt', null, null]);
    // Older saves have no gear.
    delete save.inventory.gear;
    expect(restoreInventory(save).gear.every((s) => s === null)).toBe(true);
    expect(checkSave({ ...save, inventory: { ...save.inventory, gear: 'boots' } }).kind).toBe('broken');
  });
});

describe('climbing claws', () => {
  const FLOOR = 60;
  /** A stone wall at column 10, open air to its left, and a floor far below. */
  function wallWorld(): World {
    const world = new World(30, 70, 0);
    for (let y = 0; y < 70; y++) for (let x = 10; x < 30; x++) world.setTile(x, y, Tile.Stone);
    for (let y = FLOOR; y < 70; y++) for (let x = 0; x < 30; x++) world.setTile(x, y, Tile.Stone);
    return world;
  }
  /** A player in the air against the wall, about 40 tiles up. */
  function againstWall(claws: boolean): Player {
    const player = new Player(9, 20);
    player.x = player.prevX = 10 * TILE_SIZE - PLAYER_WIDTH; // flush with the wall
    player.stats = computeStats(claws ? [{ wallGrip: 1 }] : []);
    return player;
  }
  const push = (climb = 0, jumpPressed = false): PlayerControls => ({ move: 1, jumpPressed, jumpHeld: jumpPressed, climb });

  it('slide slowly down a wall pushed against, and the slide is never a fall', () => {
    const world = wallWorld();
    const player = againstWall(true);
    let landed = 0;
    for (let i = 0; i < 60 * 30 && !player.grounded; i++) {
      player.update(DT, world, push());
      expect(player.vy).toBeLessThanOrEqual(WALL_SLIDE_SPEED);
      landed = Math.max(landed, player.fallLanded);
    }
    expect(player.grounded).toBe(true);
    expect(landed).toBeLessThan(1);
  });

  it("don't grip without the claws, or with S held", () => {
    const world = wallWorld();
    for (const [claws, climb] of [[false, 0], [true, 1]] as const) {
      const player = againstWall(claws);
      for (let i = 0; i < 60; i++) player.update(DT, world, push(climb));
      expect(player.onWall).toBe(0);
      expect(player.vy).toBeGreaterThan(WALL_SLIDE_SPEED);
    }
  });

  it('cling still while up is held too, and a jump leaps off away from the wall', () => {
    const world = wallWorld();
    const player = againstWall(true);
    for (let i = 0; i < 30; i++) player.update(DT, world, push(-1));
    const y = player.y;
    for (let i = 0; i < 60; i++) player.update(DT, world, push(-1));
    expect(player.y).toBeCloseTo(y, 5);
    expect(player.onWall).toBe(1);
    player.update(DT, world, push(0, true));
    expect(player.vy).toBeLessThan(0);
    expect(player.vx).toBeLessThan(0);
    expect(player.facing).toBe(-1);
  });
});

describe('the heat ward', () => {
  it('stretches the time between burns', () => {
    const burns = (interval: number): number => {
      const heat = new Heat();
      let n = 0;
      for (let t = 0; t < HEAT_GRACE + 8.9; t += DT) if (heat.update(DT, t, 'hot', true, interval)) n++;
      return n;
    };
    const plain = burns(HEAT_HURT_INTERVAL);
    const warded = burns(statsWith('heat_ward').heatHurtInterval);
    expect(plain).toBe(6); // as the grace runs out, then every 1.5 s for almost 9 s
    expect(warded).toBe(3); // every 3 s instead
  });
});

describe('recipe search', () => {
  it('finds recipes by what they make, then by what they use', () => {
    expect(searchRecipes('')).toEqual([]);
    const ruby = searchRecipes('RUBY').map((r) => r.output);
    expect(ruby).toEqual(['ruby_lamp', 'heat_ward']);
    expect(searchRecipes('boots').map((r) => r.output)).toEqual(['spring_boots', 'padded_boots']);
    expect(searchRecipes('zzz')).toEqual([]);
  });
});
