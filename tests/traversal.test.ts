import { describe, expect, it } from 'vitest';
import { CLIMB_SPEED, PLAYER_HEIGHT, TILE_SIZE } from '../src/config';
import { Player, type PlayerControls } from '../src/entities/player';
import { canPlace, doorSpot, tryPlace } from '../src/systems/building';
import { Inventory } from '../src/systems/inventory';
import { doorBottom, doorPartner, isDoorOpen, toggleDoor } from '../src/world/doors';
import { isFloor, Tile, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const DT = 1 / 60;
const IDLE: PlayerControls = { move: 0, jumpPressed: false, jumpHeld: false, climb: 0 };
const UP: PlayerControls = { move: 0, jumpPressed: false, jumpHeld: true, climb: -1 };
const DOWN: PlayerControls = { move: 0, jumpPressed: false, jumpHeld: false, climb: 1 };
const feet = (p: Player): number => p.y + PLAYER_HEIGHT;

function fill(world: World, tx0: number, ty0: number, tx1: number, ty1: number, id: TileId): void {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) world.setTile(tx, ty, id);
}

function run(player: Player, world: World, steps: number, controls: PlayerControls = IDLE): void {
  for (let i = 0; i < steps; i++) player.update(DT, world, controls);
}

/**
 * Ground at row 20 (stone down to the floor of a pit at row 50), with a ladder shaft dug down
 * column 10 from the surface to the pit floor.
 */
const SURFACE = 20;
const PIT_FLOOR = 50;
const SHAFT = 10;
function ladderWorld(): World {
  const world = new World(30, 60, 0);
  fill(world, 0, SURFACE, 29, 59, Tile.Stone);
  fill(world, SHAFT, SURFACE, SHAFT, PIT_FLOOR - 1, Tile.Ladder);
  return world;
}

describe('ladders', () => {
  it('climb up a shaft with W and leave you standing on the top', () => {
    const world = ladderWorld();
    const player = new Player(SHAFT, PIT_FLOOR - 1);
    run(player, world, 2);
    expect(feet(player)).toBe(PIT_FLOOR * TILE_SIZE);
    const climbTiles = PIT_FLOOR - SURFACE;
    run(player, world, Math.ceil(((climbTiles * TILE_SIZE) / CLIMB_SPEED) * 60) + 10, UP);
    expect(player.climbing).toBe(false);
    expect(feet(player)).toBe(SURFACE * TILE_SIZE);
    run(player, world, 30); // and doesn't sink back in
    expect(feet(player)).toBe(SURFACE * TILE_SIZE);
    expect(player.grounded).toBe(true);
  });

  it('a 100 m climb takes about 100 / (CLIMB_SPEED / 16) seconds', () => {
    const world = new World(10, 130, 0);
    fill(world, 0, 120, 9, 129, Tile.Stone);
    fill(world, 5, 20, 5, 119, Tile.Ladder);
    const player = new Player(5, 119);
    run(player, world, 2);
    let steps = 0;
    while (feet(player) > 20 * TILE_SIZE && steps < 2000) {
      player.update(DT, world, UP);
      steps++;
    }
    expect(steps / 60).toBeCloseTo((100 * TILE_SIZE) / CLIMB_SPEED, 0);
  });

  it('hold you in place with no keys pressed', () => {
    const world = ladderWorld();
    const player = new Player(SHAFT, PIT_FLOOR - 1);
    run(player, world, 2);
    run(player, world, 60, UP);
    const y = player.y;
    run(player, world, 60);
    expect(player.climbing).toBe(true);
    expect(player.y).toBe(y);
  });

  it('let go with a hop on Space, or drop with S + Space', () => {
    const world = ladderWorld();
    const player = new Player(SHAFT, PIT_FLOOR - 1);
    run(player, world, 2);
    run(player, world, 60, UP);
    run(player, world, 1, { ...IDLE, jumpPressed: true, jumpHeld: true });
    expect(player.climbing).toBe(false);
    expect(player.vy).toBeLessThan(0);

    run(player, world, 120); // falls back down the shaft
    expect(feet(player)).toBe(PIT_FLOOR * TILE_SIZE);
    run(player, world, 60, UP);
    const y = player.y;
    run(player, world, 1, { ...DOWN, jumpPressed: true });
    expect(player.climbing).toBe(false);
    run(player, world, 30, DOWN); // S still held: doesn't grab the ladder again
    expect(player.climbing).toBe(false);
    expect(player.y).toBeGreaterThan(y);
  });

  it('can be walked across at the top, and S climbs down into the shaft', () => {
    const world = ladderWorld();
    const player = new Player(SHAFT - 3, SURFACE - 1);
    run(player, world, 2);
    run(player, world, 40, { ...IDLE, move: 1 });
    expect(feet(player)).toBe(SURFACE * TILE_SIZE);
    expect(player.x).toBeGreaterThan((SHAFT + 1) * TILE_SIZE); // went right over it

    const onTop = new Player(SHAFT, SURFACE - 1);
    run(onTop, world, 2);
    expect(isFloor(world, SHAFT, SURFACE)).toBe(true);
    run(onTop, world, 30, DOWN);
    expect(onTop.climbing).toBe(true);
    expect(feet(onTop)).toBeGreaterThan(SURFACE * TILE_SIZE + TILE_SIZE);
  });

  it('can be climbed down by walking onto the top of a one-tile shaft with S held', () => {
    const world = ladderWorld();
    const player = new Player(SHAFT - 2, SURFACE - 1);
    run(player, world, 2);
    run(player, world, 30, { ...DOWN, move: 1 }); // walks right with S held, grabs on the way over
    run(player, world, 30, DOWN);
    expect(player.climbing).toBe(true);
    expect(feet(player)).toBeGreaterThan((SURFACE + 2) * TILE_SIZE);
    expect(player.x).toBeGreaterThanOrEqual(SHAFT * TILE_SIZE); // inside the shaft
    expect(player.x + 12).toBeLessThanOrEqual((SHAFT + 1) * TILE_SIZE);
  });

  it('can be placed against another ladder, so they hang down from a ledge', () => {
    const world = new World(20, 20, 0);
    world.setTile(5, 5, Tile.Ladder);
    const player = new Player(5, 8);
    expect(canPlace(world, player, 5, 6, Tile.Ladder)).toBe(true);
    expect(canPlace(world, player, 7, 6, Tile.Ladder)).toBe(false); // nothing to hold on to
  });
});

describe('platforms', () => {
  const FLOOR = 30;
  const PLATFORM = 27;
  function platformWorld(): World {
    const world = new World(30, 40, 0);
    fill(world, 0, FLOOR, 29, 39, Tile.Stone);
    fill(world, 5, PLATFORM, 15, PLATFORM, Tile.Platform);
    return world;
  }

  it('catch you when you fall onto them', () => {
    const world = platformWorld();
    const player = new Player(10, 5);
    run(player, world, 120);
    expect(feet(player)).toBe(PLATFORM * TILE_SIZE);
    expect(player.grounded).toBe(true);
  });

  it('let you jump up through them from below', () => {
    const world = platformWorld();
    const player = new Player(10, FLOOR - 1);
    run(player, world, 2);
    run(player, world, 1, { ...IDLE, jumpPressed: true, jumpHeld: true });
    run(player, world, 120, { ...IDLE, jumpHeld: true });
    expect(feet(player)).toBe(PLATFORM * TILE_SIZE);
  });

  it('drop you through when S is pressed, and with S + jump', () => {
    const world = platformWorld();
    const player = new Player(10, PLATFORM - 1);
    run(player, world, 2);
    run(player, world, 1, DOWN);
    run(player, world, 60);
    expect(feet(player)).toBe(FLOOR * TILE_SIZE);

    const again = new Player(10, PLATFORM - 1);
    run(again, world, 2);
    run(again, world, 1, { ...DOWN, jumpPressed: true, jumpHeld: true });
    run(again, world, 60);
    expect(feet(again)).toBe(FLOOR * TILE_SIZE);
  });

  /** Platforms at rows 12, 18 and 24 over the floor. */
  function stackWorld(): World {
    const world = new World(30, 40, 0);
    fill(world, 0, FLOOR, 29, 39, Tile.Stone);
    for (const row of [12, 18, 24]) fill(world, 5, row, 15, row, Tile.Platform);
    return world;
  }

  it('keep dropping you through the ones below while S is held', () => {
    const world = stackWorld();
    const player = new Player(10, 11);
    run(player, world, 2);
    run(player, world, 120, DOWN);
    expect(feet(player)).toBe(FLOOR * TILE_SIZE);
  });

  it('stop the drop on the next platform once S is let go', () => {
    const world = stackWorld();
    const player = new Player(10, 11);
    run(player, world, 2);
    run(player, world, 1, DOWN);
    run(player, world, 120);
    expect(feet(player)).toBe(18 * TILE_SIZE);
    expect(player.grounded).toBe(true);
  });

  it('hold you when you land on one with S already held', () => {
    const world = platformWorld();
    const player = new Player(10, 5);
    run(player, world, 120, DOWN);
    expect(feet(player)).toBe(PLATFORM * TILE_SIZE);
    // A fresh press still drops.
    run(player, world, 1);
    run(player, world, 60, DOWN);
    expect(feet(player)).toBe(FLOOR * TILE_SIZE);
  });

  it('do nothing with S on solid ground', () => {
    const world = platformWorld();
    const player = new Player(20, FLOOR - 1);
    run(player, world, 2);
    run(player, world, 30, DOWN);
    expect(feet(player)).toBe(FLOOR * TILE_SIZE);
    expect(player.grounded).toBe(true);
  });
});

describe('doors', () => {
  const FLOOR = 30;
  function doorWorld(): { world: World; player: Player; inventory: Inventory } {
    const world = new World(30, 40, 0);
    fill(world, 0, FLOOR, 29, 39, Tile.Stone);
    const player = new Player(5, FLOOR - 1);
    for (let i = 0; i < 2; i++) player.update(DT, world, IDLE);
    const inventory = new Inventory();
    inventory.add('door', 2);
    return { world, player, inventory };
  }

  it('are placed as two tiles on the ground, with the cursor on either half', () => {
    const { world, player, inventory } = doorWorld();
    expect(tryPlace(world, player, inventory, 8, FLOOR - 1)).toBe(true);
    expect(world.getTile(8, FLOOR - 1)).toBe(Tile.DoorClosedBottom);
    expect(world.getTile(8, FLOOR - 2)).toBe(Tile.DoorClosedTop);
    expect(inventory.count('door')).toBe(1);
    // Cursor on what would be the top half: the door still goes on the ground.
    expect(doorSpot(world, player, 9, FLOOR - 2)).toEqual([9, FLOOR - 1]);
    // No ground under it: no door.
    expect(doorSpot(world, player, 10, FLOOR - 4)).toBeNull();
  });

  it('block the way when closed and let you through when open', () => {
    const { world, player, inventory } = doorWorld();
    tryPlace(world, player, inventory, 8, FLOOR - 1);
    run(player, world, 60, { ...IDLE, move: 1 });
    expect(player.x + 12).toBeLessThanOrEqual(8 * TILE_SIZE);

    expect(doorBottom(world, 8, FLOOR - 2)).toEqual([8, FLOOR - 1]);
    expect(toggleDoor(world, 8, FLOOR - 1, () => false)).toBe(true);
    expect(isDoorOpen(world, 8, FLOOR - 1)).toBe(true);
    expect(world.getTile(8, FLOOR - 2)).toBe(Tile.DoorOpenTop);
    run(player, world, 60, { ...IDLE, move: 1 });
    expect(player.x).toBeGreaterThan(9 * TILE_SIZE);
  });

  it("won't close on someone standing in the doorway", () => {
    const { world, player, inventory } = doorWorld();
    tryPlace(world, player, inventory, 8, FLOOR - 1);
    toggleDoor(world, 8, FLOOR - 1, () => false);
    expect(toggleDoor(world, 8, FLOOR - 1, () => true)).toBe(false);
    expect(isDoorOpen(world, 8, FLOOR - 1)).toBe(true);
  });

  it('come down whole: breaking one half finds the other', () => {
    const { world, player, inventory } = doorWorld();
    tryPlace(world, player, inventory, 8, FLOOR - 1);
    world.setTile(8, FLOOR - 2, Tile.Air); // the top half broke
    expect(doorPartner(world, 8, FLOOR - 2, Tile.DoorClosedTop)).toEqual([8, FLOOR - 1]);
    expect(doorPartner(world, 8, FLOOR - 1, Tile.DoorClosedBottom)).toBeNull(); // its top is already gone
  });
});
