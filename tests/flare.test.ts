import { describe, expect, it } from 'vitest';
import { FLARE_FADE, FLARE_LIGHT, FLARE_TIME, TILE_SIZE } from '../src/config';
import { flareLevel, flaresFromSave, savedFlares, throwFlare, updateFlares, type Flare } from '../src/entities/flare';
import { Tile } from '../src/world/tiles';
import { World } from '../src/world/world';

const DT = 1 / 60;
const FLOOR = 30;

/** Open air above row FLOOR, stone from there down, and a stone wall at column 40. */
function testWorld(): World {
  const world = new World(60, 50, 0);
  for (let y = FLOOR; y < 50; y++) for (let x = 0; x < 60; x++) world.setTile(x, y, Tile.Stone);
  for (let y = 0; y < FLOOR; y++) world.setTile(40, y, Tile.Stone);
  return world;
}

function run(flares: Flare[], world: World, seconds: number): Flare[] {
  for (let t = 0; t < seconds; t += DT) flares = updateFlares(flares, DT, world);
  return flares;
}

describe('flares', () => {
  it('fly toward the target and stick to the first solid tile they hit', () => {
    const world = testWorld();
    // Thrown level at the wall: it arcs down a little but sticks to the wall, not the floor.
    let flares = [throwFlare(36 * TILE_SIZE, 24 * TILE_SIZE, 40 * TILE_SIZE, 24 * TILE_SIZE)];
    flares = run(flares, world, 1);
    expect(flares[0].stuckTo).toEqual({ tx: 40, ty: expect.any(Number) });
    expect(Math.floor(flares[0].x / TILE_SIZE)).toBe(39);
    const { x, y } = flares[0];
    flares = run(flares, world, 2);
    expect([flares[0].x, flares[0].y]).toEqual([x, y]);
  });

  it(`burn for ${FLARE_TIME} s, dimming at the end`, () => {
    const world = testWorld();
    let flares = [throwFlare(10 * TILE_SIZE, 20 * TILE_SIZE, 10 * TILE_SIZE, 40 * TILE_SIZE)];
    flares = run(flares, world, FLARE_TIME - FLARE_FADE - 0.5);
    expect(flares).toHaveLength(1);
    expect(flares[0].stuckTo).toEqual({ tx: 10, ty: FLOOR });
    expect(flareLevel(flares[0])).toBe(FLARE_LIGHT);
    flares = run(flares, world, 2);
    expect(flareLevel(flares[0])).toBeLessThan(FLARE_LIGHT);
    flares = run(flares, world, 3);
    expect(flares).toHaveLength(0);
  });

  it('fall again when the tile they stuck to is mined', () => {
    const world = testWorld();
    let flares = run([throwFlare(10 * TILE_SIZE, 20 * TILE_SIZE, 10 * TILE_SIZE, 40 * TILE_SIZE)], world, 2);
    world.setTile(10, FLOOR, Tile.Air);
    flares = run(flares, world, 1);
    expect(flares[0].stuckTo).toEqual({ tx: 10, ty: FLOOR + 1 });
  });

  it('keep their place and time left through a save', () => {
    const world = testWorld();
    const flares = run([throwFlare(10 * TILE_SIZE, 20 * TILE_SIZE, 10 * TILE_SIZE, 40 * TILE_SIZE)], world, 5);
    const loaded = flaresFromSave(structuredClone(savedFlares(flares)));
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ x: flares[0].x, y: flares[0].y, stuckTo: flares[0].stuckTo, timeLeft: flares[0].timeLeft });
    expect(flaresFromSave('junk')).toEqual([]);
    expect(flaresFromSave([{ x: 1, y: 2, timeLeft: 0 }, null, { x: 'a' }])).toEqual([]);
  });
});
