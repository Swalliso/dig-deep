import { describe, expect, it } from 'vitest';
import { BOMB_FUSE, DRILL_TILES_PER_COAL, ROPE_LENGTH, TILE_SIZE } from '../src/config';
import { bombsFromSave, bombTile, savedBombs, throwBomb, updateBombs, type Bomb } from '../src/entities/bomb';
import { Player } from '../src/entities/player';
import { primaryAction } from '../src/systems/building';
import { checkSave, createSave } from '../src/systems/save';
import { Health } from '../src/systems/health';
import { Inventory } from '../src/systems/inventory';
import { blastHits, blastTiles, drillTilesLeft, hangRope, rollUpRope, ROPE_PREVIEW_BELOW, ropePlan, ropePlanText, RopeSlack, ropeSlack, unrollSlack } from '../src/systems/tools';
import { isClimbable, isOneWayFloor, Tile } from '../src/world/tiles';
import { World } from '../src/world/world';

const DT = 1 / 60;
const FLOOR = 30;

/** Open air above row FLOOR, stone from there down, and a stone wall at column 40. */
function testWorld(): World {
  const world = new World(60, 100, 0);
  for (let y = FLOOR; y < 100; y++) for (let x = 0; x < 60; x++) world.setTile(x, y, Tile.Stone);
  for (let y = 0; y < FLOOR; y++) world.setTile(40, y, Tile.Stone);
  return world;
}

describe('bombs', () => {
  it('stick where they land and go off when the fuse runs out', () => {
    const world = testWorld();
    let bombs: Bomb[] = [throwBomb(30 * TILE_SIZE, 24 * TILE_SIZE, 40 * TILE_SIZE, 24 * TILE_SIZE, 1)];
    let exploded: Bomb[] = [];
    for (let t = 0; t < BOMB_FUSE - 0.1; t += DT) ({ live: bombs, exploded } = updateBombs(bombs, DT, world));
    expect(exploded).toEqual([]);
    expect(bombs[0].stuckTo).not.toBeNull();
    for (let t = 0; t < 0.2 && bombs.length > 0; t += DT) ({ live: bombs, exploded } = updateBombs(bombs, DT, world));
    expect(bombs).toEqual([]);
    expect(exploded).toHaveLength(1);
    expect(exploded[0].tier).toBe(1);
  });

  it('blast what the pickaxe tier allows in the 3 x 3, never bedrock or lava', () => {
    const world = testWorld();
    // Around (20, 40): copper ore (tier 1), iron ore (tier 2), bedrock, lava and stone.
    world.setTile(19, 39, Tile.CopperOre);
    world.setTile(20, 39, Tile.IronOre);
    world.setTile(21, 39, Tile.Bedrock);
    world.setTile(19, 40, Tile.Lava);
    world.setTile(20, 40, Tile.Air);
    const at = (tier: number): string[] => blastTiles(world, 20, 40, tier).map(([x, y]) => `${x},${y}`);
    expect(at(0)).toEqual(['21,40', '19,41', '20,41', '21,41']);
    expect(at(1)).toEqual(['19,39', '21,40', '19,41', '20,41', '21,41']);
    expect(at(5)).toEqual(['19,39', '20,39', '21,40', '19,41', '20,41', '21,41']);
    expect(at(-1)).toEqual([]); // no pickaxe, nothing breaks
  });

  it('hurt a player in the 5 x 5 around the blast', () => {
    const near = new Player(22, 41); // standing two tiles to the side
    const far = new Player(24, 41);
    expect(blastHits(20, 40, near.x, near.y)).toBe(true);
    expect(blastHits(20, 40, far.x, far.y)).toBe(false);
  });

  it('are saved with their fuses and stay where they were', () => {
    const world = testWorld();
    let bombs = [throwBomb(10 * TILE_SIZE, 20 * TILE_SIZE, 10 * TILE_SIZE, 40 * TILE_SIZE, 3)];
    for (let i = 0; i < 30; i++) bombs = updateBombs(bombs, DT, world).live;
    const save = structuredClone(createSave(world, new Player(2, 2), new Inventory(), [], undefined, { survival: { health: new Health(10), difficulty: 'normal', bed: null, satchels: [], bombs } }));
    expect(checkSave(save).kind).toBe('ok');
    const back = bombsFromSave(save.bombs);
    expect(back).toHaveLength(1);
    expect(savedBombs(back)).toEqual(savedBombs(bombs));
    expect(bombTile(back[0])).toEqual(bombTile(bombs[0]));
    expect(bombsFromSave([{ x: 1, y: 2, fuse: -1, tier: 0 }, { x: 'a' }, null])).toEqual([]);
  });
});

describe('rope coils', () => {
  /** A shaft (columns 20–21) going 40 tiles down from the surface. */
  function shaftWorld(): World {
    const world = testWorld();
    for (let y = FLOOR; y < FLOOR + 40; y++) for (let x = 20; x <= 21; x++) world.setTile(x, y, Tile.Air);
    return world;
  }
  const playerAt = (tx: number): Player => new Player(tx, FLOOR - 1);

  it('hang from an edge and unroll down through the open, up to their length', () => {
    const world = shaftWorld();
    const player = playerAt(19);
    // The top of the shaft, beside its lip.
    expect(ropePlan(world, player, 20, FLOOR)).toEqual({ length: ROPE_LENGTH, below: 40 - ROPE_LENGTH });
    // In mid-air with nothing to hang from, or in rock: no.
    expect(ropePlan(world, player, 20, FLOOR - 2)).toBeNull();
    expect(ropePlan(world, player, 18, FLOOR)).toBeNull();
    // A short drop: it stops at the floor.
    world.setTile(20, FLOOR + 6, Tile.Stone);
    expect(ropePlan(world, player, 20, FLOOR)).toEqual({ length: 6, below: 0 });
    expect(ropePlanText({ length: 6, below: 0 })).toBe('Rope ladder: 6 m, reaches the floor');
    expect(ropePlanText({ length: 20, below: 7 })).toBe('Rope ladder: 20 m, ends 7 m above the floor');
    expect(ropePlanText({ length: 20, below: ROPE_PREVIEW_BELOW })).toContain('past its end');
  });

  it('make a climbable rope ladder that rolls back up whole when any part breaks', () => {
    const world = shaftWorld();
    hangRope(world, 20, FLOOR, ROPE_LENGTH);
    expect(isClimbable(world.getTile(20, FLOOR + 5))).toBe(true);
    expect(isOneWayFloor(world, 20, FLOOR)).toBe(true); // its top, like a ladder's
    // Break a tile in the middle: everything above and below goes, for one coil.
    world.setTile(20, FLOOR + 8, Tile.Air);
    expect(rollUpRope(world, 20, FLOOR + 8)).toBe(1);
    for (let y = FLOOR; y < FLOOR + ROPE_LENGTH; y++) expect(world.getTile(20, y)).toBe(Tile.Air);
  });

  it('never give back more coils than they took', () => {
    const world = shaftWorld();
    // Two ropes hung end to end make one 40-tile rope: two coils back.
    hangRope(world, 21, FLOOR, 2 * ROPE_LENGTH);
    world.setTile(21, FLOOR, Tile.Air);
    expect(rollUpRope(world, 21, FLOOR)).toBe(2);
    hangRope(world, 21, FLOOR, 5);
    world.setTile(21, FLOOR + 4, Tile.Air);
    expect(rollUpRope(world, 21, FLOOR + 4)).toBe(1);
  });

  it('unroll into new air when the floor under their end opens up, up to the rest of their coils', () => {
    const world = shaftWorld();
    const ropes = new RopeSlack(world);
    expect(ropeSlack(6)).toBe(ROPE_LENGTH - 6);
    expect(ropeSlack(ROPE_LENGTH)).toBe(0);
    expect(ropeSlack(ROPE_LENGTH + 5)).toBe(ROPE_LENGTH - 5);
    // A 6-tile rope over a floor, with another floor 4 tiles under that.
    world.setTile(20, FLOOR + 6, Tile.Stone);
    world.setTile(20, FLOOR + 11, Tile.Stone);
    hangRope(world, 20, FLOOR, 6);
    expect(ropes.update(8)).toEqual([]);
    // Dig out the floor: it unrolls down to the next one.
    world.setTile(20, FLOOR + 6, Tile.Air);
    expect(ropes.size).toBe(1);
    expect(ropes.update(8)).toEqual([{ tx: 20, ty: FLOOR + 10 }]);
    for (let y = FLOOR; y <= FLOOR + 10; y++) expect(world.getTile(20, y)).toBe(Tile.Rope);
    // Dig that one too: the rest of its coil, and no further.
    world.setTile(20, FLOOR + 11, Tile.Air);
    expect(ropes.update(8)).toEqual([{ tx: 20, ty: FLOOR + ROPE_LENGTH - 1 }]);
    expect(world.getTile(20, FLOOR + ROPE_LENGTH)).toBe(Tile.Air);
    // All its coil is out now: the floor under its end opening up again changes nothing.
    world.setTile(20, FLOOR + ROPE_LENGTH, Tile.Stone);
    world.setTile(20, FLOOR + ROPE_LENGTH, Tile.Air);
    expect(ropes.size).toBe(1);
    expect(ropes.update(8)).toEqual([]);
    // It still rolls up into the one coil it took.
    world.setTile(20, FLOOR + 3, Tile.Air);
    expect(rollUpRope(world, 20, FLOOR + 3)).toBe(1);
    expect(ropes.update(8)).toEqual([]); // the broken tile was under rope a moment ago, but it's all rolled up
    for (let y = FLOOR; y < FLOOR + 40; y++) expect(world.getTile(20, y)).toBe(Tile.Air);
  });

  it("never unroll past the coils they took, and handle a few ropes each step", () => {
    const world = shaftWorld();
    const ropes = new RopeSlack(world);
    // Two coils hung end to end, 25 tiles long over a floor: 15 tiles of slack.
    world.setTile(21, FLOOR + 25, Tile.Stone);
    hangRope(world, 21, FLOOR, 25);
    world.setTile(21, FLOOR + 25, Tile.Air);
    expect(unrollSlack(world, 21, FLOOR + 25)).toBe(15);
    expect(unrollSlack(world, 21, FLOOR + 40)).toBe(0); // not under a rope
    world.setTile(21, FLOOR + 10, Tile.Air);
    expect(rollUpRope(world, 21, FLOOR + 10)).toBe(2);
    ropes.update(8);
    // Three short ropes whose floors go at once, two unrolled per step.
    const short = new World(60, 100, 0);
    const queue = new RopeSlack(short);
    for (const x of [5, 7, 9]) {
      short.setTile(x - 1, 9, Tile.Stone); // a wall to hang from
      short.setTile(x, 12, Tile.Stone);
      hangRope(short, x, 10, 2);
    }
    for (const x of [5, 7, 9]) short.setTile(x, 12, Tile.Air);
    expect(queue.update(2)).toHaveLength(2);
    expect(queue.size).toBe(1);
    expect(queue.update(2)).toHaveLength(1);
    for (const x of [5, 7, 9]) expect(short.getTile(x, 10 + ROPE_LENGTH - 1)).toBe(Tile.Rope);
  });
});

describe('the drill', () => {
  it('runs on coal: so many tiles per coal, plus what is left of the one burning', () => {
    expect(drillTilesLeft(0, 0)).toBe(0);
    expect(drillTilesLeft(3, 0)).toBe(3);
    expect(drillTilesLeft(2, 5)).toBe(2 + 5 * DRILL_TILES_PER_COAL);
  });
});

describe('left-click with a tool', () => {
  it('digs with the drill, throws a bomb and hangs a rope coil', () => {
    expect(primaryAction('drill', Tile.Air)).toBe('dig');
    expect(primaryAction('drill', Tile.Stone)).toBe('dig');
    expect(primaryAction('bomb', Tile.Stone)).toBe('throw');
    expect(primaryAction('rope_coil', Tile.Air)).toBe('rope');
    expect(primaryAction('rope_coil', Tile.Stone)).toBe('dig'); // like a held block
    expect(primaryAction('miner_helmet', Tile.Stone)).toBe('dig');
  });
});
