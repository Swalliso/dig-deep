import { describe, expect, it } from 'vitest';
import { PLAYER_HEIGHT, PLAYER_WIDTH, RUN_SPEED, TILE_SIZE } from '../src/config';
import { overlapsSolid, Player, type PlayerControls } from '../src/entities/player';
import { createRng } from '../src/util/rng';
import { generateWorld } from '../src/world/generate';
import { Tile, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const DT = 1 / 60;
const FLOOR = 30; // floor row in the test worlds
const FLOOR_Y = FLOOR * TILE_SIZE;
const IDLE: PlayerControls = { move: 0, jumpPressed: false, jumpHeld: false };

/** 60 x 40 empty world with solid stone from row FLOOR down. */
function flatWorld(): World {
  const world = new World(60, 40, 0);
  fill(world, 0, FLOOR, 59, 39, Tile.Stone);
  return world;
}

function fill(world: World, tx0: number, ty0: number, tx1: number, ty1: number, id: TileId): void {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) world.setTile(tx, ty, id);
}

function run(player: Player, world: World, steps: number, controls: PlayerControls = IDLE): void {
  for (let i = 0; i < steps; i++) player.update(DT, world, controls);
}

/** Player standing on the floor at column tx. */
function standingPlayer(world: World, tx: number): Player {
  const player = new Player(tx, FLOOR - 1);
  run(player, world, 2);
  return player;
}

/** Hold jump (and optionally a direction) and return the highest point the feet reach. */
function jumpRise(player: Player, world: World, holdSteps: number, move = 0): number {
  const startFeet = player.y + PLAYER_HEIGHT;
  let minY = player.y;
  for (let i = 0; i < 90; i++) {
    const held = i < holdSteps;
    player.update(DT, world, { move, jumpPressed: i === 0, jumpHeld: held });
    minY = Math.min(minY, player.y);
  }
  return startFeet - (minY + PLAYER_HEIGHT);
}

describe('player physics', () => {
  it('falls and comes to rest exactly on the floor', () => {
    const world = flatWorld();
    const player = new Player(5, 10);
    run(player, world, 120);
    expect(player.y + PLAYER_HEIGHT).toBe(FLOOR_Y);
    expect(player.grounded).toBe(true);
  });

  it('cannot fall through a 1-tile platform at max fall speed', () => {
    const world = new World(20, 60, 0);
    fill(world, 0, 55, 19, 55, Tile.Stone);
    const player = new Player(5, 0);
    run(player, world, 240);
    expect(player.y + PLAYER_HEIGHT).toBe(55 * TILE_SIZE);
  });

  it('reaches run speed quickly and stops quickly', () => {
    const world = flatWorld();
    const player = standingPlayer(world, 5);
    run(player, world, 10, { move: 1, jumpPressed: false, jumpHeld: false });
    expect(player.vx).toBe(RUN_SPEED);
    run(player, world, 10);
    expect(player.vx).toBe(0);
  });

  it('auto-steps up a 1-tile ledge', () => {
    const world = flatWorld();
    fill(world, 10, FLOOR - 1, 59, FLOOR - 1, Tile.Stone);
    const player = standingPlayer(world, 5);
    run(player, world, 60, { move: 1, jumpPressed: false, jumpHeld: false });
    expect(player.x).toBeGreaterThan(10 * TILE_SIZE);
    expect(player.y + PLAYER_HEIGHT).toBe((FLOOR - 1) * TILE_SIZE);
  });

  it('is stopped by a 2-tile wall', () => {
    const world = flatWorld();
    fill(world, 10, FLOOR - 2, 59, FLOOR - 1, Tile.Stone);
    const player = standingPlayer(world, 5);
    run(player, world, 60, { move: 1, jumpPressed: false, jumpHeld: false });
    expect(player.x + PLAYER_WIDTH).toBe(10 * TILE_SIZE);
    expect(player.y + PLAYER_HEIGHT).toBe(FLOOR_Y);
  });

  it('jumps about 4 tiles when jump is held', () => {
    const world = flatWorld();
    const rise = jumpRise(standingPlayer(world, 5), world, 90);
    expect(rise).toBeGreaterThan(4 * TILE_SIZE);
    expect(rise).toBeLessThan(5 * TILE_SIZE);
  });

  it('jumps lower when jump is released early', () => {
    const world = flatWorld();
    const full = jumpRise(standingPlayer(world, 5), world, 90);
    const tap = jumpRise(standingPlayer(world, 5), world, 1);
    expect(tap).toBeLessThan(full / 3);
  });

  it('can jump onto a 4-tile ledge but not a 5-tile one', () => {
    for (const [height, clears] of [[4, true], [5, false]] as const) {
      const world = flatWorld();
      fill(world, 10, FLOOR - height, 59, FLOOR - 1, Tile.Stone);
      const player = standingPlayer(world, 8);
      jumpRise(player, world, 90, 1);
      expect(player.x > 10 * TILE_SIZE).toBe(clears);
    }
  });

  it('still jumps shortly after walking off a ledge (coyote time)', () => {
    for (const [wait, jumps] of [[3, true], [10, false]] as const) {
      const world = new World(60, 40, 0);
      fill(world, 0, FLOOR, 9, 39, Tile.Stone); // ledge ends at column 9, then a deep pit
      const player = standingPlayer(world, 5);
      while (player.grounded) player.update(DT, world, { move: 1, jumpPressed: false, jumpHeld: false });
      run(player, world, wait);
      player.update(DT, world, { move: 0, jumpPressed: true, jumpHeld: true });
      expect(player.vy < 0).toBe(jumps);
    }
  });

  it('remembers a jump pressed just before landing (jump buffer)', () => {
    // Dry run: how many steps does a fall from 6 tiles up take to land?
    const world = flatWorld();
    const probe = new Player(5, FLOOR - 7);
    let landing = 0;
    while (!probe.grounded) {
      probe.update(DT, world, IDLE);
      landing++;
    }

    for (const [early, jumps] of [[3, true], [12, false]] as const) {
      const player = new Player(5, FLOOR - 7);
      run(player, world, landing - early);
      player.update(DT, world, { move: 0, jumpPressed: true, jumpHeld: true });
      let jumped = false;
      for (let i = 0; i < early + 3; i++) {
        player.update(DT, world, { move: 0, jumpPressed: false, jumpHeld: true });
        if (player.vy < 0) jumped = true;
      }
      expect(jumped).toBe(jumps);
    }
  });

  it('never ends up inside terrain while playing randomly in a generated world', () => {
    const world = generateWorld(42);
    const player = new Player(world.spawnTx, world.spawnTy);
    const rng = createRng(99);
    let controls = IDLE;
    for (let i = 0; i < 6000; i++) {
      if (i % 20 === 0) {
        const jump = rng() < 0.4;
        controls = { move: [-1, 0, 1][Math.floor(rng() * 3)], jumpPressed: jump, jumpHeld: jump };
      } else {
        controls = { ...controls, jumpPressed: false };
      }
      player.update(DT, world, controls);
      if (overlapsSolid(world, player.x, player.y)) {
        throw new Error(`player inside terrain at step ${i}: (${player.x}, ${player.y})`);
      }
    }
  });
});

describe('debug fly mode', () => {
  it('ignores gravity and walls while flying', () => {
    const world = flatWorld();
    fill(world, 10, 0, 10, FLOOR - 1, Tile.Stone); // a wall from the sky to the floor
    const player = standingPlayer(world, 5);
    player.setFlying(true, world);
    run(player, world, 30); // no input: hovers in place
    expect(player.y + PLAYER_HEIGHT).toBe(FLOOR_Y);
    run(player, world, 60, { move: 1, jumpPressed: false, jumpHeld: false, climb: 1 });
    expect(player.x).toBeGreaterThan(10 * TILE_SIZE); // straight through the wall
    expect(player.y + PLAYER_HEIGHT).toBeGreaterThan(FLOOR_Y); // and down into the floor
  });

  it('lifts the player out of terrain when fly mode is turned off', () => {
    const world = flatWorld();
    const player = standingPlayer(world, 5);
    player.setFlying(true, world);
    run(player, world, 30, { move: 0, jumpPressed: false, jumpHeld: false, climb: 1 });
    expect(overlapsSolid(world, player.x, player.y)).toBe(true);
    player.setFlying(false, world);
    expect(overlapsSolid(world, player.x, player.y)).toBe(false);
    run(player, world, 60);
    expect(player.y + PLAYER_HEIGHT).toBe(FLOOR_Y);
  });
});

describe('player events (for sound and dust)', () => {
  it('flags the step a jump starts and the step it lands, with the fall speed', () => {
    const world = flatWorld();
    const player = standingPlayer(world, 5);
    expect(player.jumped).toBe(false);
    player.update(DT, world, { move: 0, jumpPressed: true, jumpHeld: true });
    expect(player.jumped).toBe(true);
    player.update(DT, world, { move: 0, jumpPressed: false, jumpHeld: true });
    expect(player.jumped).toBe(false);
    let landed = 0;
    for (let i = 0; i < 120 && !landed; i++) {
      player.update(DT, world, { move: 0, jumpPressed: false, jumpHeld: true });
      landed = player.landingSpeed;
    }
    // Coming down from a full jump is about as fast as going up.
    expect(landed).toBeGreaterThan(400);
    run(player, world, 1);
    expect(player.landingSpeed).toBe(0);
  });

  it('never reports a landing while walking on flat ground', () => {
    const world = flatWorld();
    const player = standingPlayer(world, 5);
    for (let i = 0; i < 60; i++) {
      player.update(DT, world, { move: 1, jumpPressed: false, jumpHeld: false });
      expect(player.landingSpeed).toBe(0);
    }
  });

  it('knows the tile under its feet', () => {
    const world = flatWorld();
    world.setTile(5, FLOOR, Tile.Planks);
    const player = standingPlayer(world, 5);
    expect(player.groundTile(world)).toBe(Tile.Planks);
    // A hole under the player: nothing under its feet...
    world.setTile(5, FLOOR, Tile.Air);
    expect(player.groundTile(world)).toBe(Tile.Air);
    // ...until one foot is over the stone next to it.
    player.placeAt(5 * TILE_SIZE - PLAYER_WIDTH / 2, player.y);
    expect(player.groundTile(world)).toBe(Tile.Stone);
    // In the air: nothing.
    player.placeAt(5 * TILE_SIZE, 10 * TILE_SIZE);
    expect(player.groundTile(world)).toBe(Tile.Air);
  });
});
