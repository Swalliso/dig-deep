import { describe, expect, it } from 'vitest';
import { PLAYER_HEIGHT, SAFE_FALL_TILES, TILE_SIZE } from '../src/config';
import { Player, type PlayerControls } from '../src/entities/player';
import { Inventory } from '../src/systems/inventory';
import { fallDamage } from '../src/systems/health';
import { createSave, restoreFallTop } from '../src/systems/save';
import { Tile, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const DT = 1 / 60;
const IDLE: PlayerControls = { move: 0, jumpPressed: false, jumpHeld: false, climb: 0 };
const RIGHT: PlayerControls = { move: 1, jumpPressed: false, jumpHeld: false, climb: 0 };
const DOWN: PlayerControls = { move: 0, jumpPressed: false, jumpHeld: false, climb: 1 };
const FLOOR = 50;

function fill(world: World, tx0: number, ty0: number, tx1: number, ty1: number, id: TileId): void {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) world.setTile(tx, ty, id);
}

/** Open air over a stone floor at row FLOOR. */
function openWorld(): World {
  const world = new World(30, 60, 0);
  fill(world, 0, FLOOR, 29, 59, Tile.Stone);
  return world;
}

/**
 * Run until the player lands (or `maxSteps`), returning the tiles fallen at the landing and
 * whether they were ever on a ladder on the way.
 */
function fallUntilLanded(player: Player, world: World, controls: (step: number) => PlayerControls = () => IDLE, maxSteps = 600): { tiles: number; climbed: boolean } {
  let climbed = false;
  let airborne = false;
  for (let i = 0; i < maxSteps; i++) {
    player.update(DT, world, controls(i));
    climbed ||= player.climbing;
    if (player.fallLanded > 0) return { tiles: player.fallLanded, climbed };
    if (player.grounded && airborne) return { tiles: 0, climbed };
    airborne ||= !player.grounded;
  }
  return { tiles: 0, climbed };
}

/** A player standing in mid-air with their feet `tiles` above the floor, in column 5. */
function dropFrom(tiles: number): Player {
  return new Player(5, FLOOR - tiles - 1);
}

describe('falls', () => {
  it('a 10-tile fall does no damage and a 20-tile fall does', () => {
    const ten = fallUntilLanded(dropFrom(10), openWorld());
    expect(ten.tiles).toBeCloseTo(10, 1);
    expect(fallDamage(ten.tiles, SAFE_FALL_TILES)).toBe(0);
    const twenty = fallUntilLanded(dropFrom(20), openWorld());
    expect(twenty.tiles).toBeCloseTo(20, 1);
    expect(fallDamage(twenty.tiles, SAFE_FALL_TILES)).toBeGreaterThan(0);
  });

  it('measures from the top of a jump, so jumping on flat ground is always safe', () => {
    const world = openWorld();
    const player = new Player(5, FLOOR - 1);
    player.update(DT, world, IDLE);
    expect(player.grounded).toBe(true);
    const jump = fallUntilLanded(player, world, (i) => ({ move: 0, jumpPressed: i === 0, jumpHeld: true, climb: 0 }));
    expect(jump.tiles).toBeGreaterThan(2);
    expect(fallDamage(jump.tiles, SAFE_FALL_TILES)).toBe(0);
    expect(player.fallTop).toBeNull();
  });

  it('grabbing a ladder mid-fall ends the fall with no damage', () => {
    const world = openWorld();
    // The ladder runs from above the player (its top is a floor, so they'd land on it otherwise).
    fill(world, 5, 0, 5, FLOOR - 1, Tile.Ladder);
    const player = new Player(5, 2); // 47 tiles up: fatal without the ladder
    // Fall freely for 20 tiles, then hold S: the ladder catches, and the player climbs down.
    const result = fallUntilLanded(player, world, () => (player.y > 25 * TILE_SIZE ? DOWN : IDLE), 2000);
    expect(result.climbed).toBe(true);
    expect(fallDamage(result.tiles, SAFE_FALL_TILES)).toBe(0);
    expect(player.y + PLAYER_HEIGHT).toBe(FLOOR * TILE_SIZE);
  });

  it('walking into a ladder shaft from the side catches you on the ladder', () => {
    // A tunnel (rows 24..29) leads into a shaft with ladders above and below the tunnel floor.
    const world = new World(30, 60, 0);
    fill(world, 0, 20, 29, 59, Tile.Stone);
    fill(world, 0, 24, 9, 29, Tile.Air);
    fill(world, 10, 21, 10, 58, Tile.Ladder);
    const player = new Player(5, 29);
    player.update(DT, world, IDLE);
    expect(player.grounded).toBe(true);
    let caught = false;
    for (let i = 0; i < 120 && !player.climbing; i++) {
      player.update(DT, world, RIGHT);
      caught ||= player.caughtByLadder;
    }
    expect(player.climbing).toBe(true);
    expect(caught).toBe(true);
    // Caught at once: barely below the tunnel floor, and no fall in progress.
    expect(player.y + PLAYER_HEIGHT).toBeLessThan(30 * TILE_SIZE + 2);
    expect(player.fallTop).toBeNull();
    for (let i = 0; i < 60; i++) player.update(DT, world, IDLE);
    expect(player.climbing).toBe(true);
    expect(player.y + PLAYER_HEIGHT).toBeLessThan(30 * TILE_SIZE + 2);
  });

  it('jumping into a ladder shaft does not catch you', () => {
    const world = new World(30, 60, 0);
    fill(world, 0, 20, 29, 59, Tile.Stone);
    fill(world, 0, 22, 9, 29, Tile.Air);
    fill(world, 10, 21, 10, 58, Tile.Ladder);
    const player = new Player(7, 29);
    player.update(DT, world, IDLE);
    const result = fallUntilLanded(player, world, (i) => ({ move: 1, jumpPressed: i === 0, jumpHeld: true, climb: 0 }), 2000);
    expect(result.climbed).toBe(false);
    expect(result.tiles).toBeGreaterThan(SAFE_FALL_TILES);
  });

  it('walking off a plain ledge falls normally', () => {
    const world = openWorld();
    fill(world, 0, 30, 5, FLOOR - 1, Tile.Stone); // a 20-tile cliff, columns 0..5
    const player = new Player(4, 29);
    player.update(DT, world, IDLE);
    const result = fallUntilLanded(player, world, () => RIGHT, 2000);
    expect(result.climbed).toBe(false);
    expect(result.tiles).toBeCloseTo(20, 0);
  });

  it('a reload halfway down keeps the fall, so the landing hurts as much', () => {
    const uninterrupted = fallUntilLanded(dropFrom(25), openWorld());

    const world = openWorld();
    const player = dropFrom(25);
    for (let i = 0; i < 40; i++) player.update(DT, world, IDLE);
    expect(player.fallTop).not.toBeNull();
    const save = structuredClone(createSave(world, player, new Inventory(), []));
    const reloaded = new Player(0, 0);
    reloaded.placeAt(save.player.x, save.player.y);
    reloaded.fallTop = restoreFallTop(save);
    const rest = fallUntilLanded(reloaded, world);
    expect(rest.tiles).toBeCloseTo(uninterrupted.tiles, 1);
    expect(fallDamage(rest.tiles, SAFE_FALL_TILES)).toBe(fallDamage(uninterrupted.tiles, SAFE_FALL_TILES));
    // Older saves have no fall: nothing in progress.
    expect(restoreFallTop({ ...save, player: { x: 0, y: 0 } })).toBeNull();
  });

  it('flying and climbing never count as falling', () => {
    const world = openWorld();
    const player = dropFrom(30);
    player.setFlying(true, world);
    for (let i = 0; i < 30; i++) player.update(DT, world, IDLE);
    expect(player.fallTop).toBeNull();
    // Turning fly mode off in the air starts a fall from there.
    player.setFlying(false, world);
    const result = fallUntilLanded(player, world);
    expect(result.tiles).toBeCloseTo(30, 0);
  });
});
