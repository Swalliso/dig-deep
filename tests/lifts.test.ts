import { describe, expect, it } from 'vitest';
import { CLIMB_SPEED, LIFT_SPEED, PLAYER_HEIGHT, SURFACE_LEVEL, TILE_SIZE } from '../src/config';
import { LIFT_SHAFT_LENGTH, placeLiftShaft } from '../src/debug';
import { overlapsSolid, Player } from '../src/entities/player';
import { canPlace } from '../src/systems/building';
import { cageStep, defaultStopName, Lifts, riderSpot, stopLanding, stopProblem, type CageEvent, type StopSpot } from '../src/systems/lifts';
import { restoreTileEntities, savedState, type SaveData } from '../src/systems/save';
import { Inventory } from '../src/systems/inventory';
import { floorAt, railSpan, stopFits, stopRail, stopsOnColumn } from '../src/world/lifts';
import { TileEntities } from '../src/world/tileEntities';
import { isClimbable, isFloor, Tile, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const RX = 10;
const DT = 1 / 60;

function fill(world: World, tx0: number, ty0: number, tx1: number, ty1: number, id: TileId): void {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) world.setTile(tx, ty, id);
}

/**
 * Solid stone, with a column of lift rail at RX from `top` to `bottom` (headroom above it) and a
 * stop on its right at each of `rows`, each with a pocket to stand in and stone underfoot.
 */
function liftWorld(top: number, bottom: number, rows: number[], height = 120): { world: World; entities: TileEntities } {
  const world = new World(24, height, 0);
  fill(world, 0, 0, 23, height - 1, Tile.Stone);
  world.setTile(RX, top - 1, Tile.Air);
  fill(world, RX, top, RX, bottom, Tile.LiftRail);
  const entities = new TileEntities(world);
  rows.forEach((sy, i) => {
    world.setTile(RX + 1, sy - 1, Tile.Air);
    world.setTile(RX + 1, sy, Tile.LiftStop);
    entities.set(RX + 1, sy, { kind: 'liftStop', name: `Stop ${i + 1}` });
  });
  return { world, entities };
}

/** Run the lifts until `cage` arrives (or `limit` seconds pass); returns the seconds taken and every event. */
function runUntilArrived(lifts: Lifts, world: World, cageId: number, limit = 60): { time: number; events: CageEvent[] } {
  const events: CageEvent[] = [];
  let time = 0;
  while (time < limit) {
    const step = lifts.update(DT, world);
    events.push(...step);
    time += DT;
    if (step.some((e) => e.cage.id === cageId && e.kind !== 'rattle')) break;
  }
  return { time, events };
}

describe('lift geometry', () => {
  it('finds the rail beside a stop (the left one first) and the unbroken span through a tile', () => {
    const { world } = liftWorld(10, 40, [10, 40]);
    expect(stopRail(world, RX + 1, 10)).toBe(RX);
    expect(stopRail(world, RX + 3, 10)).toBeNull();
    world.setTile(RX + 2, 20, Tile.LiftRail);
    world.setTile(RX + 1, 20, Tile.LiftStop);
    expect(stopRail(world, RX + 1, 20)).toBe(RX); // rail on both sides: the left one
    expect(railSpan(world, RX, 25)).toEqual({ top: 10, bottom: 40 });
    world.setTile(RX, 30, Tile.Stone);
    expect(railSpan(world, RX, 25)).toEqual({ top: 10, bottom: 29 });
    expect(railSpan(world, RX, 30)).toBeNull();
  });

  it('lists every stop on a rail column, top first', () => {
    const { world } = liftWorld(10, 60, [60, 10, 35]);
    world.setTile(RX - 1, 20, Tile.LiftStop); // on the left side too
    expect(stopsOnColumn(world, RX)).toEqual([
      { sx: RX + 1, sy: 10 },
      { sx: RX - 1, sy: 20 },
      { sx: RX + 1, sy: 35 },
      { sx: RX + 1, sy: 60 },
    ]);
  });

  it('is climbable like a ladder, so a rail column can be built and used without one', () => {
    expect(isClimbable(Tile.LiftRail)).toBe(true);
  });
});

describe('placing lift stops', () => {
  it('needs a rail beside the stop and a floor under it', () => {
    const { world } = liftWorld(10, 40, []);
    world.setTile(RX + 1, 19, Tile.Air);
    world.setTile(RX + 1, 20, Tile.Air);
    const player = new Player(RX + 1, 20);
    expect(stopFits(world, RX + 1, 20)).toBe(true);
    expect(canPlace(world, player, RX + 1, 20, Tile.LiftStop)).toBe(true);
    world.setTile(RX + 1, 21, Tile.Air); // no floor to step out onto
    expect(stopFits(world, RX + 1, 20)).toBe(false);
    expect(canPlace(world, player, RX + 1, 20, Tile.LiftStop)).toBe(false);
    world.setTile(RX + 1, 21, Tile.Platform); // a platform is a floor too
    expect(canPlace(world, player, RX + 1, 20, Tile.LiftStop)).toBe(true);
    world.setTile(RX, 20, Tile.Stone); // the rail beside it is gone
    expect(canPlace(world, player, RX + 1, 20, Tile.LiftStop)).toBe(false);
  });

  it('names a new stop after where it is, numbering repeats on the same rail', () => {
    // Below the surface level (row SURFACE_LEVEL), so only the open sky makes the top one 'Surface'.
    const top = SURFACE_LEVEL + 10;
    const { world, entities } = liftWorld(top, top + 50, [], SURFACE_LEVEL + 80);
    fill(world, RX + 1, 0, RX + 1, top - 1, Tile.Air);
    world.setTile(RX + 1, top, Tile.LiftStop);
    expect(defaultStopName(world, entities, RX + 1, top)).toBe('Surface');
    world.setTile(RX + 1, top - 5, Tile.Stone); // a roof over it
    expect(defaultStopName(world, entities, RX + 1, top)).toBe('Stop');
    entities.set(RX + 1, top, { kind: 'liftStop', name: 'Stop' });
    world.setTile(RX + 1, top + 30, Tile.LiftStop);
    // Not a strata world, under rock: 'Stop', and 'Stop' is taken on this rail.
    expect(defaultStopName(world, entities, RX + 1, top + 30)).toBe('Stop 2');
  });
});

describe('cage motion', () => {
  it('speeds up to LIFT_SPEED, never past it, and stops exactly level with the stop', () => {
    let y = floorAt(10);
    let vy = 0;
    let top = 0;
    for (let i = 0; i < 2000; i++) {
      const next = cageStep(y, vy, floorAt(310), DT);
      top = Math.max(top, Math.abs(next.vy));
      y = next.y;
      vy = next.vy;
      if (next.arrived) break;
    }
    expect(y).toBe(floorAt(310));
    expect(top).toBeLessThanOrEqual(LIFT_SPEED);
    expect(top).toBeGreaterThan(LIFT_SPEED * 0.99);
  });

  it(`rides a ${LIFT_SHAFT_LENGTH} m lift both ways, much faster than climbing a ladder`, () => {
    const { world, entities } = liftWorld(10, 10 + LIFT_SHAFT_LENGTH, [10, 10 + LIFT_SHAFT_LENGTH], 330);
    const lifts = new Lifts();
    const top: StopSpot = { sx: RX + 1, sy: 10 };
    const bottom: StopSpot = { sx: RX + 1, sy: 10 + LIFT_SHAFT_LENGTH };
    const cage = lifts.cageFor(world, top)!;
    expect(lifts.isAt(cage, top.sy)).toBe(true);
    const ladder = (LIFT_SHAFT_LENGTH * TILE_SIZE) / CLIMB_SPEED;
    for (const to of [bottom, top]) {
      lifts.send(cage, to.sy);
      const { time, events } = runUntilArrived(lifts, world, cage.id);
      expect(events.at(-1)).toEqual({ kind: 'arrived', cage });
      expect(lifts.isAt(cage, to.sy)).toBe(true);
      expect(time).toBeLessThan(ladder / 4);
      expect(events.filter((e) => e.kind === 'rattle').length).toBeGreaterThan(10);
      // The rider steps out standing at the stop.
      const landing = stopLanding(to);
      expect(overlapsSolid(world, landing.x, landing.y)).toBe(false);
      expect(isFloor(world, to.sx, to.sy + 1)).toBe(true);
      expect(landing.y + PLAYER_HEIGHT).toBe(floorAt(to.sy));
    }
    expect(stopsOnColumn(world, RX).map(({ sx, sy }) => entities.get(sx, sy))).toHaveLength(2);
  });

  it('keeps a rider inside the rail column, with no solid tiles to overlap on the way', () => {
    const { world } = liftWorld(10, 60, [10, 60]);
    const lifts = new Lifts();
    const cage = lifts.cageFor(world, { sx: RX + 1, sy: 10 })!;
    lifts.send(cage, 60);
    for (let i = 0; i < 600 && cage.target !== null; i++) {
      lifts.update(DT, world);
      const spot = riderSpot(cage);
      expect(overlapsSolid(world, spot.x, spot.y)).toBe(false);
    }
  });

  it('stops at a break in the rail, and is removed if the rail under it goes', () => {
    const { world } = liftWorld(10, 60, [10, 60]);
    const lifts = new Lifts();
    const cage = lifts.cageFor(world, { sx: RX + 1, sy: 10 })!;
    lifts.send(cage, 60);
    world.setTile(RX, 40, Tile.Air);
    const { events } = runUntilArrived(lifts, world, cage.id);
    expect(events.at(-1)?.kind).toBe('stuck');
    expect(cage.y).toBe(floorAt(39));
    expect(cage.target).toBeNull();
    world.setTile(RX, 39, Tile.Stone);
    expect(lifts.update(DT, world)).toEqual([{ kind: 'removed', cage }]);
    expect(lifts.cages).toHaveLength(0);
  });

  it('keeps one cage when two rails are joined into one', () => {
    const { world } = liftWorld(10, 60, [10, 60]);
    world.setTile(RX, 30, Tile.Air);
    const lifts = new Lifts();
    const a = lifts.cageFor(world, { sx: RX + 1, sy: 10 })!;
    const b = lifts.cageFor(world, { sx: RX + 1, sy: 60 })!;
    expect(a).not.toBe(b);
    world.setTile(RX, 30, Tile.LiftRail);
    expect(lifts.cageOn(world, RX, 30)).toBe(a);
    expect(lifts.cages).toEqual([a]);
  });
});

describe('the lift panel view', () => {
  it('says which stops a trip can go to, and why the others are blocked', () => {
    const { world, entities } = liftWorld(10, 70, [10, 30, 50, 70]);
    const lifts = new Lifts();
    const status = () => lifts.view(world, entities, RX + 1, 30)!.stops.map((s) => s.status);
    expect(status()).toEqual(['ok', 'here', 'ok', 'ok']);
    world.setTile(RX + 1, 49, Tile.Stone); // something where the player would step out
    world.setTile(RX, 9, Tile.Stone); // no room above the rail at the top for the cage
    expect(status()).toEqual(['noHeadroom', 'here', 'blocked', 'ok']);
    world.setTile(RX + 1, 49, Tile.Air);
    world.setTile(RX, 9, Tile.Air);
    world.setTile(RX, 60, Tile.Air); // the rail is broken between the last two stops
    const view = lifts.view(world, entities, RX + 1, 30)!;
    expect(view.stops.map((s) => s.status)).toEqual(['ok', 'here', 'ok', 'disconnected']);
    expect(view.stops[3].gapRow).toBe(60);
    expect(view.stops.map((s) => [s.name, s.depth])).toEqual([
      ['Stop 1', 11 - SURFACE_LEVEL],
      ['Stop 2', 31 - SURFACE_LEVEL],
      ['Stop 3', 51 - SURFACE_LEVEL],
      ['Stop 4', 71 - SURFACE_LEVEL],
    ]);
  });

  it('gives a rail its cage at the stop where it is first used', () => {
    const { world, entities } = liftWorld(10, 70, [10, 70]);
    const lifts = new Lifts();
    const view = lifts.view(world, entities, RX + 1, 70)!;
    expect(view.cageRow).toBe(70);
    expect(lifts.view(world, entities, RX + 1, 10)!.cage).toBe(view.cage);
    expect(stopProblem(world, { sx: RX + 1, sy: 10 }, RX)).toBeNull();
  });
});

describe('saving lifts', () => {
  it('saves a moving cage parked where it was heading, and a rider at the end of the trip', () => {
    const { world } = liftWorld(10, 70, [10, 70]);
    const lifts = new Lifts();
    const cage = lifts.cageFor(world, { sx: RX + 1, sy: 10 })!;
    lifts.send(cage, 70);
    for (let i = 0; i < 30; i++) lifts.update(DT, world);
    expect(cage.y).toBeGreaterThan(floorAt(10));
    expect(lifts.saved()).toEqual({ cages: [{ tx: RX, y: floorAt(70) }] });
    const restored = new Lifts(world, lifts.saved());
    expect(restored.cages.map((c) => [c.tx, c.y, c.target])).toEqual([[RX, floorAt(70), null]]);
    // The game saves a rider at the stop the ride ends at (Game.savedPlayer); savedState takes that.
    const end = stopLanding({ sx: RX + 1, sy: 70 });
    const state = savedState({ ...end, fallTop: null, centerX: end.x + 6, centerY: end.y + 14 }, new Inventory(), []);
    expect(state.player).toEqual({ x: end.x, y: end.y, fallTop: null });
  });

  it('drops cages that are off the rail or between rows when loading', () => {
    const { world } = liftWorld(10, 70, [10, 70]);
    const restored = new Lifts(world, { cages: [{ tx: RX, y: floorAt(20) }, { tx: RX + 3, y: floorAt(20) }, { tx: RX, y: floorAt(20) + 5 }, null, { tx: 'x' }] });
    expect(restored.cages.map((c) => c.y)).toEqual([floorAt(20)]);
    expect(new Lifts(world, 'nonsense').cages).toEqual([]);
  });

  it('keeps stop names only on lift stops', () => {
    const { world } = liftWorld(10, 70, [10, 70]);
    const save = {
      tileEntities: [
        { tx: RX + 1, ty: 10, kind: 'liftStop', name: 'Home' },
        { tx: RX + 1, ty: 70, kind: 'liftStop', name: 'A very long name that goes on' },
        { tx: RX + 2, ty: 70, kind: 'liftStop', name: 'Not a stop' },
        { tx: RX + 1, ty: 10, kind: 'liftStop' },
      ],
    } as unknown as SaveData;
    const entities = restoreTileEntities(save, world);
    expect(entities.entries().map(({ tx, ty, entity }) => [tx, ty, entity])).toEqual([
      [RX + 1, 10, { kind: 'liftStop', name: 'Home' }],
      [RX + 1, 70, { kind: 'liftStop', name: 'A very long name t' }],
    ]);
  });
});

describe('the debug lift', () => {
  it(`builds a ${LIFT_SHAFT_LENGTH} m rail with named stops that all have room to arrive`, () => {
    const world = new World(24, 340, 0);
    fill(world, 0, 0, 23, 339, Tile.Stone);
    fill(world, 0, 0, 23, 9, Tile.Air);
    const entities = new TileEntities(world);
    expect(placeLiftShaft(world, entities, RX, 10)).toBe(LIFT_SHAFT_LENGTH);
    const stops = stopsOnColumn(world, RX);
    expect(stops.map((s) => s.sy)).toEqual([10, 110, 210, 309]);
    const lifts = new Lifts();
    const view = lifts.view(world, entities, RX + 1, 10)!;
    expect(view.stops.map((s) => s.status)).toEqual(['here', 'ok', 'ok', 'ok']);
    expect(view.stops[0].name).toBe('Surface');
  });
});
