import { describe, expect, it } from 'vitest';
import { CRACK_STAGES, MAX_STACK, PICKAXES, REACH, TILE_SIZE } from '../src/config';
import { ItemDrop, updateDrops } from '../src/entities/itemDrop';
import { Player } from '../src/entities/player';
import { canPlace, tryPlace } from '../src/systems/building';
import { Inventory } from '../src/systems/inventory';
import { Mining } from '../src/systems/mining';
import { Tile, tileDef, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const DT = 1 / 60;
const FLOOR = 30;
const PX = 20; // player column

/** 60 x 40 world: dirt floor from row FLOOR down, player standing on it at column PX. */
function setup(): { world: World; player: Player } {
  const world = new World(60, 40, 0);
  for (let ty = FLOOR; ty < 40; ty++) for (let tx = 0; tx < 60; tx++) world.setTile(tx, ty, Tile.Dirt);
  const player = new Player(PX, FLOOR - 1);
  for (let i = 0; i < 2; i++) player.update(DT, world, { move: 0, jumpPressed: false, jumpHeld: false });
  return { world, player };
}

/** Hold the mine button on (tx, ty) for up to `seconds`; returns the step count when it broke, or -1. */
function mineFor(mining: Mining, world: World, player: Player, tx: number, ty: number, seconds: number, tier = 0): number {
  for (let step = 1; step <= Math.round(seconds / DT); step++) {
    if (mining.update(DT, world, player, tx, ty, true, tier)) return step;
  }
  return -1;
}

describe('mining', () => {
  it('breaks a tile after hardness / pickaxe speed seconds', () => {
    for (const [tile, tier] of [[Tile.Dirt, 0], [Tile.Stone, 0], [Tile.Stone, 4]] as [TileId, number][]) {
      const { world, player } = setup();
      world.setTile(PX + 1, FLOOR, tile);
      const steps = mineFor(new Mining(), world, player, PX + 1, FLOOR, 5, tier);
      const expected = tileDef(tile).hardness / PICKAXES[tier].speed / DT;
      expect(Math.abs(steps - expected)).toBeLessThanOrEqual(1);
      expect(world.getTile(PX + 1, FLOOR)).toBe(Tile.Air);
    }
  });

  it('shows the crack stages in order while mining', () => {
    const { world, player } = setup();
    world.setTile(PX + 1, FLOOR, Tile.Stone);
    const mining = new Mining();
    const seen: number[] = [];
    while (!mining.update(DT, world, player, PX + 1, FLOOR, true, 0)) {
      const stage = mining.cracks(world)[0]?.stage ?? 0;
      if (seen[seen.length - 1] !== stage) seen.push(stage);
    }
    expect(seen).toEqual(Array.from({ length: CRACK_STAGES }, (_, i) => i + 1));
    expect(mining.cracks(world)).toEqual([]);
  });

  it('keeps damage on a tile when the cursor moves away, so it can be finished later', () => {
    const { world, player } = setup();
    const mining = new Mining();
    const full = tileDef(Tile.Dirt).hardness / DT; // steps to break dirt in one go
    for (let i = 0; i < 10; i++) mining.update(DT, world, player, PX + 1, FLOOR, true, 0);
    const before = mining.progressAt(world, PX + 1, FLOOR);
    expect(before).toBeGreaterThan(0);

    // Mine a different tile for a bit, then let go entirely.
    for (let i = 0; i < 5; i++) mining.update(DT, world, player, PX + 2, FLOOR, true, 0);
    for (let i = 0; i < 30; i++) mining.update(DT, world, player, PX + 2, FLOOR, false, 0);
    expect(mining.progressAt(world, PX + 1, FLOOR)).toBe(before);
    expect(mining.cracks(world)).toHaveLength(2);

    // Coming back only needs the remaining time.
    const remaining = mineFor(mining, world, player, PX + 1, FLOOR, 5);
    expect(Math.abs(remaining - (full - 10))).toBeLessThanOrEqual(1);
  });

  it('forgets damage on a tile that has changed', () => {
    const { world, player } = setup();
    const mining = new Mining();
    for (let i = 0; i < 10; i++) mining.update(DT, world, player, PX + 1, FLOOR, true, 0);
    world.setTile(PX + 1, FLOOR, Tile.Stone);
    expect(mining.progressAt(world, PX + 1, FLOOR)).toBe(0);
    expect(mining.cracks(world)).toEqual([]);
  });

  it('will not crack a tile above the pickaxe tier, and says why', () => {
    const { world, player } = setup();
    world.setTile(PX + 1, FLOOR, Tile.CopperOre);
    const mining = new Mining();
    expect(mineFor(mining, world, player, PX + 1, FLOOR, 5, 0)).toBe(-1);
    expect(mining.progressAt(world, PX + 1, FLOOR)).toBe(0);
    expect(mining.hint?.text).toBe('Need better pickaxe');
    expect(mineFor(new Mining(), world, player, PX + 1, FLOOR, 5, 1)).toBeGreaterThan(0);
  });

  it(`will not mine beyond ${REACH} tiles, and says why`, () => {
    const { world, player } = setup();
    const mining = new Mining();
    expect(mineFor(mining, world, player, PX + REACH + 1, FLOOR, 2)).toBe(-1);
    expect(mining.hint?.text).toBe('Too far away');
    expect(mineFor(mining, world, player, PX + 3, FLOOR, 2)).toBeGreaterThan(0);
  });

  it('never breaks bedrock', () => {
    const { world, player } = setup();
    world.setTile(PX + 1, FLOOR, Tile.Bedrock);
    expect(mineFor(new Mining(), world, player, PX + 1, FLOOR, 10, PICKAXES.length - 1)).toBe(-1);
  });
});

describe('building', () => {
  it('places the selected block next to the ground and uses one item', () => {
    const { world, player } = setup();
    const inv = new Inventory();
    inv.add('dirt', 3);
    expect(tryPlace(world, player, inv, PX + 2, FLOOR - 1)).toBe(true);
    expect(world.getTile(PX + 2, FLOOR - 1)).toBe(Tile.Dirt);
    expect(inv.count('dirt')).toBe(2);
  });

  it('can stack blocks into a wall', () => {
    const { world, player } = setup();
    const inv = new Inventory();
    inv.add('dirt', 3);
    for (let i = 1; i <= 3; i++) expect(tryPlace(world, player, inv, PX + 2, FLOOR - i)).toBe(true);
    expect(inv.selectedStack).toBeNull();
    expect(tryPlace(world, player, inv, PX + 2, FLOOR - 4)).toBe(false);
  });

  it('refuses floating, occupied, out-of-reach and player-overlapping spots', () => {
    const { world, player } = setup();
    expect(canPlace(world, player, PX + 2, FLOOR - 3, Tile.Dirt)).toBe(false); // floating
    expect(canPlace(world, player, PX + 2, FLOOR, Tile.Dirt)).toBe(false); // already dirt
    expect(canPlace(world, player, PX + REACH + 1, FLOOR - 1, Tile.Dirt)).toBe(false); // too far
    expect(canPlace(world, player, PX, FLOOR - 1, Tile.Dirt)).toBe(false); // player is standing there
    expect(canPlace(world, player, PX + 1, FLOOR - 1, Tile.Dirt)).toBe(true);
  });

  it('does nothing when the selected item cannot be placed', () => {
    const { world, player } = setup();
    const inv = new Inventory();
    inv.add('coal', 1);
    expect(tryPlace(world, player, inv, PX + 1, FLOOR - 1)).toBe(false);
    expect(inv.count('coal')).toBe(1);
  });
});

describe('item drops', () => {
  function dropAt(tx: number, ty: number): ItemDrop {
    return new ItemDrop('stone', 1, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
  }

  it('flies to a nearby player and is collected', () => {
    const { world, player } = setup();
    const inv = new Inventory();
    let drops = [dropAt(PX + 1, FLOOR - 1)];
    for (let i = 0; i < 60 && drops.length; i++) drops = updateDrops(drops, DT, world, player, inv);
    expect(drops).toHaveLength(0);
    expect(inv.count('stone')).toBe(1);
  });

  it('stays on the ground when the player is far away', () => {
    const { world, player } = setup();
    const inv = new Inventory();
    let drops = [dropAt(PX + 8, FLOOR - 1)];
    for (let i = 0; i < 120; i++) drops = updateDrops(drops, DT, world, player, inv);
    expect(drops).toHaveLength(1);
    expect(drops[0].y + 8).toBe(FLOOR * TILE_SIZE);
    expect(inv.count('stone')).toBe(0);
  });

  it('stays on the ground when the inventory is full', () => {
    const { world, player } = setup();
    const inv = new Inventory();
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = { item: 'dirt', count: MAX_STACK };
    let drops = [dropAt(PX, FLOOR - 1)];
    for (let i = 0; i < 60; i++) drops = updateDrops(drops, DT, world, player, inv);
    expect(drops).toHaveLength(1);
  });
});
