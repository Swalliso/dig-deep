import { describe, expect, it } from 'vitest';
import { BOMB_FUSE, DRILL_TILES_PER_COAL, ROPE_LENGTH, TILE_SIZE } from '../src/config';
import { bombsFromSave, bombTile, savedBombs, throwBomb, updateBombs, type Bomb } from '../src/entities/bomb';
import { Player } from '../src/entities/player';
import { primaryAction } from '../src/systems/building';
import { checkSave, createSave } from '../src/systems/save';
import { Health } from '../src/systems/health';
import { Inventory } from '../src/systems/inventory';
import { blastHits, blastTiles, cutRope, drillTilesLeft, hangRope, ropeCoils, ropeExtension, ROPE_PREVIEW_BELOW, ropePlan, ropePlanText, RopeSlack, ropeSlack, ropeSpan, unrollSlack, type RopePlan } from '../src/systems/tools';
import { createRng, randInt } from '../src/util/rng';
import { isClimbable, isOneWayFloor, Tile, tileDef } from '../src/world/tiles';
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
  /** A shaft (columns 20–21) going `depth` tiles down from the surface. */
  function shaftWorld(depth = 40): World {
    const world = testWorld();
    for (let y = FLOOR; y < FLOOR + depth; y++) for (let x = 20; x <= 21; x++) world.setTile(x, y, Tile.Air);
    return world;
  }
  /** A player standing beside the shaft at the surface, or in it at row `ty`. */
  const playerAt = (tx: number, ty = FLOOR - 1): Player => new Player(tx, ty);
  /** A new rope's plan, for its text. */
  const newRope = (length: number, below: number): RopePlan => ({ from: FLOOR, length, below, extending: 0, joins: 0, coils: 1 });
  /** The ropes in column tx, as [top, end] rows. */
  function ropesIn(world: World, tx: number): [number, number][] {
    const ropes: [number, number][] = [];
    for (let y = 0; y < world.height; y++) {
      if (world.getTile(tx, y) !== Tile.Rope) continue;
      const { end } = ropeSpan(world, tx, y);
      ropes.push([y, end]);
      y = end;
    }
    return ropes;
  }
  /** The coils the ropes in these columns count as. */
  const coilsIn = (world: World, ...columns: number[]): number => columns.flatMap((tx) => ropesIn(world, tx)).reduce((sum, [top, end]) => sum + ropeCoils(end - top + 1), 0);
  /** Break the rope tile at (tx, ty) as mining does (the tile goes first, then the rope is cut there). Returns the coils that come back. */
  function cut(world: World, tx: number, ty: number): number {
    world.setTile(tx, ty, Tile.Air);
    return cutRope(world, tx, ty);
  }

  it('hang from an edge and unroll down through the open, up to their length', () => {
    const world = shaftWorld();
    const player = playerAt(19);
    // The top of the shaft, beside its lip.
    expect(ropePlan(world, player, 20, FLOOR)).toEqual({ from: FLOOR, length: ROPE_LENGTH, below: 40 - ROPE_LENGTH, extending: 0, joins: 0, coils: 1 });
    // In mid-air with nothing to hang from, or in rock: no.
    expect(ropePlan(world, player, 20, FLOOR - 2)).toBeNull();
    expect(ropePlan(world, player, 18, FLOOR)).toBeNull();
    // A short drop: it stops at the floor.
    world.setTile(20, FLOOR + 6, Tile.Stone);
    expect(ropePlan(world, player, 20, FLOOR)).toMatchObject({ length: 6, below: 0, coils: 1 });
    expect(ropePlanText(newRope(6, 0))).toBe('Rope ladder: 6 m, reaches the floor');
    expect(ropePlanText(newRope(20, 7))).toBe('Rope ladder: 20 m, ends 7 m above the floor');
    expect(ropePlanText(newRope(20, ROPE_PREVIEW_BELOW))).toContain('past its end');
  });

  it('make a climbable rope ladder, tougher to cut than stone', () => {
    const world = shaftWorld();
    hangRope(world, 20, FLOOR, ROPE_LENGTH);
    expect(isClimbable(world.getTile(20, FLOOR + 5))).toBe(true);
    expect(isOneWayFloor(world, 20, FLOOR)).toBe(true); // its top, like a ladder's
    // A stray click while digging down beside it doesn't cut it.
    expect(tileDef(Tile.Rope).hardness).toBeGreaterThan(tileDef(Tile.Stone).hardness);
  });

  it('keep the part above a cut, rolling up only the part below', () => {
    const world = shaftWorld(80);
    const ropes = new RopeSlack(world);
    hangRope(world, 20, FLOOR, 2 * ROPE_LENGTH); // two coils, hanging over a drop that goes on
    // Cut partway down the first coil: the second coil comes back, and the first stays up and
    // lets the rest of its rope back down into the gap.
    expect(cut(world, 20, FLOOR + 8)).toBe(1);
    expect(ropesIn(world, 20)).toEqual([[FLOOR, FLOOR + 7]]);
    expect(ropes.update(8)).toEqual([{ tx: 20, ty: FLOOR + ROPE_LENGTH - 1 }]);
    expect(ropesIn(world, 20)).toEqual([[FLOOR, FLOOR + ROPE_LENGTH - 1]]);
    // A cut partway down its only coil gives nothing back, and the rope drops straight back down,
    // so a stray cut costs nothing.
    expect(cut(world, 20, FLOOR + 15)).toBe(0);
    ropes.update(8);
    expect(ropesIn(world, 20)).toEqual([[FLOOR, FLOOR + ROPE_LENGTH - 1]]);
    // Cutting its top rolls all of it up.
    expect(cut(world, 20, FLOOR)).toBe(1);
    expect(ropes.update(8)).toEqual([]);
    expect(ropesIn(world, 20)).toEqual([]);
  });

  it('never give back more coils than they took, wherever they are cut', () => {
    const depth = 70;
    const world = shaftWorld(depth);
    const ropes = new RopeSlack(world);
    // On a floor right under its end, or (with all its coils out) over a drop that goes on.
    const cases = [1, 6, 19, 20, 21, 33, 40, 41, 60].map((length) => ({ length, floor: true }));
    cases.push(...[20, 40, 60].map((length) => ({ length, floor: false })));
    for (const { length, floor } of cases) {
      for (let at = 0; at < length; at++) {
        for (let y = FLOOR; y < FLOOR + depth; y++) world.setTile(20, y, Tile.Air);
        hangRope(world, 20, FLOOR, length);
        if (floor) world.setTile(20, FLOOR + length, Tile.Stone);
        ropes.update(8);
        const back = cut(world, 20, FLOOR + at);
        ropes.update(8);
        const left = ropesIn(world, 20);
        const now = left.length > 0 ? left[0][1] - left[0][0] + 1 : 0;
        const where = `a ${length}-tile rope cut ${at} tiles down`;
        expect(left.length, where).toBeLessThanOrEqual(1);
        if (now > 0) expect(left[0][0], where).toBe(FLOOR);
        expect(back + ropeCoils(now), where).toBe(ropeCoils(length)); // no coil made or lost
        expect(now, where).toBeGreaterThanOrEqual(at); // the part above stays
        expect(now, where).toBeLessThanOrEqual(length); // and it never grows longer than it was
        if (at === 0) expect(back, where).toBe(ropeCoils(length));
      }
    }
  });

  it('get longer by a coil from their end, wherever on the rope the coil is used', () => {
    const world = shaftWorld(70);
    const ropes = new RopeSlack(world);
    const player = playerAt(21, FLOOR + 1); // in the shaft, beside the rope's top
    hangRope(world, 20, FLOOR, ROPE_LENGTH);
    // Aimed at the rope, though its end is 20 m down: the coil unrolls from under its end.
    const more = ropePlan(world, player, 20, FLOOR + 2)!;
    expect(more).toEqual({ from: FLOOR + ROPE_LENGTH, length: ROPE_LENGTH, below: 70 - 2 * ROPE_LENGTH, extending: ROPE_LENGTH, joins: 0, coils: 1 });
    expect(ropePlanText(more)).toBe('Rope ladder: 40 m (+20 m), ends 30 m above the floor');
    hangRope(world, 20, more.from, more.length);
    expect(ropesIn(world, 20)).toEqual([[FLOOR, FLOOR + 2 * ROPE_LENGTH - 1]]);
    expect(coilsIn(world, 20)).toBe(2);
    // The open spot under its end works too, but only in reach.
    expect(ropePlan(world, playerAt(21, FLOOR + 2 * ROPE_LENGTH), 20, FLOOR + 2 * ROPE_LENGTH)).toMatchObject({ from: FLOOR + 2 * ROPE_LENGTH, extending: 2 * ROPE_LENGTH, coils: 1 });
    expect(ropePlan(world, player, 20, FLOOR + 2 * ROPE_LENGTH)).toBeNull();
    expect(ropePlan(world, player, 20, FLOOR + 30)).toBeNull();
    // A rope that already reaches the floor can't get longer.
    world.setTile(20, FLOOR + 2 * ROPE_LENGTH, Tile.Stone);
    expect(ropePlan(world, player, 20, FLOOR + 2)).toBeNull();
    // With the floor 5 tiles under its end, a third coil unrolls 5 tiles...
    world.setTile(20, FLOOR + 2 * ROPE_LENGTH, Tile.Air);
    world.setTile(20, FLOOR + 2 * ROPE_LENGTH + 5, Tile.Stone);
    ropes.update(8);
    const third = ropePlan(world, player, 20, FLOOR)!;
    expect(third).toMatchObject({ length: 5, below: 0, coils: 1 });
    expect(ropePlanText(third)).toBe('Rope ladder: 45 m (+5 m), reaches the floor');
    hangRope(world, 20, third.from, third.length);
    expect(coilsIn(world, 20)).toBe(3);
    // ...and the rest of it when that floor is dug out, and no more.
    world.setTile(20, FLOOR + 2 * ROPE_LENGTH + 5, Tile.Air);
    expect(ropes.update(8)).toEqual([{ tx: 20, ty: FLOOR + 3 * ROPE_LENGTH - 1 }]);
    expect(coilsIn(world, 20)).toBe(3);
    // Cutting its top gives all three coils back.
    expect(cut(world, 20, FLOOR)).toBe(3);
  });

  it("take no coil for rope that's already theirs, and join a rope they land on", () => {
    const world = shaftWorld(70);
    // A 6-tile rope whose slack hasn't unrolled yet over a 10-tile gap (its floor was just blown
    // away): it only lets out its own slack, so no coil is used.
    hangRope(world, 20, FLOOR, 6);
    world.setTile(20, FLOOR + 16, Tile.Stone);
    expect(ropeExtension(world, 20, FLOOR + 3)).toMatchObject({ from: FLOOR + 6, length: 10, extending: 6, coils: 0 });
    // A rope hung right over another rope's top joins it, and only takes a coil if the two need
    // more coils than the lower one took.
    world.setTile(21, FLOOR + 15, Tile.Stone);
    hangRope(world, 21, FLOOR + 10, 5);
    const player = playerAt(19);
    const join = ropePlan(world, player, 21, FLOOR + 3)!;
    expect(join).toMatchObject({ from: FLOOR + 3, length: 7, below: 0, extending: 0, joins: 5, coils: 0 });
    expect(ropePlanText(join)).toBe('Rope ladder: 7 m, joins the rope below');
    world.setTile(21, FLOOR + 15, Tile.Air);
    world.setTile(21, FLOOR + 30, Tile.Stone);
    hangRope(world, 21, FLOOR + 15, 15); // the rope below is now 20 tiles: no slack to use
    expect(ropePlan(world, player, 21, FLOOR + 3)).toMatchObject({ length: 7, joins: ROPE_LENGTH, coils: 1 });
  });

  it('never make coils or rope, whatever is done to them', () => {
    // Random coils used, cuts, and floors dug or filled in a 70-tile shaft, each followed by the
    // step's unrolling. With one rope at a time, the coils in hand and in the rope always add up
    // to what there was; with any number in both columns, never to more.
    const START = 12;
    for (const oneRope of [true, false]) {
      const depth = 70;
      const world = shaftWorld(depth);
      const ropes = new RopeSlack(world);
      const rng = createRng(oneRope ? 7 : 8);
      const columns = oneRope ? [20] : [20, 21];
      let coils = START;
      for (let step = 0; step < 400; step++) {
        const tx = columns[randInt(rng, 0, columns.length - 1)];
        const inColumn = ropesIn(world, tx);
        /** A tile of a rope in the column. */
        const onRope = (): number => {
          const [top, end] = inColumn[randInt(rng, 0, inColumn.length - 1)];
          return randInt(rng, top, end);
        };
        const anywhere = randInt(rng, FLOOR, FLOOR + depth - 1);
        const op = randInt(rng, 0, 2);
        if (op === 0 && coils > 0) {
          // Extend a rope, or hang one (with one rope at a time, only in an empty column).
          const ty = inColumn.length > 0 && (oneRope || rng() < 0.5) ? onRope() : anywhere;
          const plan = ropePlan(world, playerAt(tx === 20 ? 21 : 20, ty), tx, ty);
          if (plan) {
            hangRope(world, tx, plan.from, plan.length);
            coils -= plan.coils;
          }
        } else if (op === 1 && inColumn.length > 0) {
          coils += cut(world, tx, onRope());
        } else if (op === 2) {
          // Dig out a tile, or now and then fill one in.
          const tile = world.getTile(tx, anywhere);
          if (tile === Tile.Stone) world.setTile(tx, anywhere, Tile.Air);
          else if (tile === Tile.Air && rng() < 0.4) world.setTile(tx, anywhere, Tile.Stone);
        }
        ropes.update(8);
        expect(coils).toBeGreaterThanOrEqual(0);
        if (oneRope) expect(coils + coilsIn(world, ...columns), `step ${step}`).toBe(START);
        else expect(coils + coilsIn(world, ...columns), `step ${step}`).toBeLessThanOrEqual(START);
      }
    }
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
    expect(cut(world, 20, FLOOR)).toBe(1);
    expect(ropes.update(8)).toEqual([]);
    for (let y = FLOOR; y < FLOOR + 40; y++) expect(world.getTile(20, y)).toBe(Tile.Air);
  });

  it('never unroll past the coils they took, and handle a few ropes each step', () => {
    const world = shaftWorld();
    // Two coils hung end to end, 25 tiles long over a floor: 15 tiles of slack.
    world.setTile(21, FLOOR + 25, Tile.Stone);
    hangRope(world, 21, FLOOR, 25);
    world.setTile(21, FLOOR + 25, Tile.Air);
    expect(unrollSlack(world, 21, FLOOR + 25)).toBe(15);
    expect(unrollSlack(world, 21, FLOOR + 40)).toBe(0); // not under a rope
    expect(cut(world, 21, FLOOR)).toBe(2);
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
    expect(primaryAction('rope_coil', Tile.Rope)).toBe('rope'); // adds it to that rope
    expect(primaryAction('rope_coil', Tile.Stone)).toBe('dig'); // like a held block
    expect(primaryAction('miner_helmet', Tile.Stone)).toBe('dig');
  });
});
