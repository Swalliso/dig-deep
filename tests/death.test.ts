import { describe, expect, it } from 'vitest';
import { HOTBAR_SIZE, MAX_HEALTH, MAX_STACK, PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from '../src/config';
import { overlapsSolid, Player } from '../src/entities/player';
import { bedSpot, canPlace, itemForTile, tryPlace } from '../src/systems/building';
import { readBackup, backupText } from '../src/systems/backup';
import {
  collectSatchel,
  dropSatchel,
  findRespawn,
  restoreBed,
  restoreSatchels,
  satchelItemCount,
  takeBag,
  touchesSatchel,
  type Satchel,
} from '../src/systems/death';
import { Health } from '../src/systems/health';
import { Inventory } from '../src/systems/inventory';
import {
  createSave,
  metaFromSave,
  restoreDifficulty,
  restoreHealth,
  savedState,
  type SaveData,
  type SurvivalState,
} from '../src/systems/save';
import { bedPartner, isWholeBed } from '../src/world/beds';
import { isFloor, Tile, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const FLOOR = 40;

function fill(world: World, tx0: number, ty0: number, tx1: number, ty1: number, id: TileId): void {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) world.setTile(tx, ty, id);
}

/** Flat ground at row FLOOR (columns 0..59), spawn at column 30 standing on it. */
function flatWorld(): World {
  const world = new World(60, 60, 0);
  fill(world, 0, FLOOR, 59, 59, Tile.Stone);
  world.spawnTx = 30;
  world.spawnTy = FLOOR - 1;
  return world;
}

/** A hotbar and bag with a mix of items, a pickaxe in each. */
function packedInventory(): Inventory {
  const inv = new Inventory();
  inv.slots[0] = { item: 'wooden_pickaxe', count: 1 };
  inv.slots[1] = { item: 'torch', count: 10 };
  inv.slots[HOTBAR_SIZE] = { item: 'coal', count: 30 };
  inv.slots[HOTBAR_SIZE + 3] = { item: 'iron_pickaxe', count: 1 };
  inv.slots[HOTBAR_SIZE + 7] = { item: 'gold_ore', count: 5 };
  return inv;
}

function fullInventory(): Inventory {
  const inv = new Inventory();
  inv.slots.fill(null).forEach((_, i) => (inv.slots[i] = { item: 'dirt', count: MAX_STACK }));
  return inv;
}

describe('dying', () => {
  it('puts the bag in a satchel, keeping the hotbar and every pickaxe', () => {
    const inv = packedInventory();
    const stacks = takeBag(inv);
    expect(stacks).toEqual([
      { item: 'coal', count: 30 },
      { item: 'gold_ore', count: 5 },
    ]);
    expect(inv.slots[0]).toEqual({ item: 'wooden_pickaxe', count: 1 });
    expect(inv.slots[1]).toEqual({ item: 'torch', count: 10 });
    expect(inv.slots[HOTBAR_SIZE + 3]).toEqual({ item: 'iron_pickaxe', count: 1 }); // a bag pickaxe stays put
    expect(inv.count('coal') + inv.count('gold_ore')).toBe(0);
    expect(inv.bestPickaxeTier()).toBe(3);
  });

  it('leaves no satchel when the bag held nothing to lose', () => {
    const inv = new Inventory();
    inv.slots[HOTBAR_SIZE] = { item: 'stone_pickaxe', count: 1 };
    expect(dropSatchel(new Player(5, 5), takeBag(inv))).toBeNull();
  });

  it('drops the satchel at the player’s feet', () => {
    const player = new Player(10, FLOOR - 1);
    const satchel = dropSatchel(player, [{ item: 'coal', count: 3 }])!;
    expect(touchesSatchel(player, satchel)).toBe(true);
    expect(satchelItemCount(satchel)).toBe(3);
    const elsewhere = new Player(20, FLOOR - 1);
    expect(touchesSatchel(elsewhere, satchel)).toBe(false);
  });
});

describe('collecting a satchel', () => {
  it('takes everything when there is room', () => {
    const satchel: Satchel = { x: 0, y: 0, stacks: [{ item: 'coal', count: 30 }, { item: 'gold_ore', count: 5 }] };
    const inv = new Inventory();
    expect(collectSatchel(satchel, inv)).toBe(35);
    expect(satchel.stacks).toEqual([]);
    expect(inv.count('coal')).toBe(30);
  });

  it('with a full inventory takes what fits and leaves the rest in the satchel', () => {
    const inv = fullInventory();
    inv.slots[4] = { item: 'coal', count: MAX_STACK - 10 };
    const satchel: Satchel = { x: 0, y: 0, stacks: [{ item: 'coal', count: 25 }, { item: 'gold_ore', count: 5 }] };
    expect(collectSatchel(satchel, inv)).toBe(10);
    expect(satchel.stacks).toEqual([
      { item: 'coal', count: 15 },
      { item: 'gold_ore', count: 5 },
    ]);
    // Nothing is lost: everything is either carried or still in the satchel.
    expect(inv.count('coal') + satchelItemCount(satchel) - 5).toBe(MAX_STACK + 15);
    expect(collectSatchel(satchel, inv)).toBe(0);
    expect(satchelItemCount(satchel)).toBe(20);
  });
});

describe('beds', () => {
  it('are placed two tiles wide on solid ground, from either half', () => {
    const world = flatWorld();
    const player = new Player(20, FLOOR - 1);
    expect(bedSpot(world, player, 22, FLOOR - 1)).toEqual([22, FLOOR - 1]);
    world.setTile(23, FLOOR - 1, Tile.Torch); // no room to the right: the cursor tile is the right half
    expect(bedSpot(world, player, 22, FLOOR - 1)).toEqual([21, FLOOR - 1]);
    expect(canPlace(world, player, 22, FLOOR - 3, Tile.BedLeft)).toBe(false); // floating
    const inv = new Inventory();
    inv.slots[0] = { item: 'bed', count: 2 };
    expect(tryPlace(world, player, inv, 22, FLOOR - 1)).toBe(true);
    expect(isWholeBed(world, 21, FLOOR - 1)).toBe(true);
    expect(inv.slots[0]).toEqual({ item: 'bed', count: 1 });
    expect(itemForTile(Tile.BedRight)).toBe('bed');
  });

  it('break as a whole: either half finds the other', () => {
    const world = flatWorld();
    world.setTile(10, FLOOR - 1, Tile.BedLeft);
    world.setTile(11, FLOOR - 1, Tile.BedRight);
    world.setTile(11, FLOOR - 1, Tile.Air);
    expect(bedPartner(world, 11, FLOOR - 1, Tile.BedRight)).toEqual([10, FLOOR - 1]);
    world.setTile(11, FLOOR - 1, Tile.BedRight);
    world.setTile(10, FLOOR - 1, Tile.Air);
    expect(bedPartner(world, 10, FLOOR - 1, Tile.BedLeft)).toEqual([11, FLOOR - 1]);
    expect(bedPartner(world, 10, FLOOR - 1, Tile.Stone)).toBeNull();
  });
});

describe('respawning', () => {
  function bedWorld(): World {
    const world = flatWorld();
    world.setTile(10, FLOOR - 1, Tile.BedLeft);
    world.setTile(11, FLOOR - 1, Tile.BedRight);
    return world;
  }

  /** The point is a real place to stand: inside the world, clear of rock, with a floor under the feet. */
  function expectSafe(world: World, x: number, y: number): void {
    expect(overlapsSolid(world, x, y)).toBe(false);
    const row = Math.floor((y + PLAYER_HEIGHT) / TILE_SIZE);
    expect((y + PLAYER_HEIGHT) % TILE_SIZE).toBe(0);
    const cols = [Math.floor(x / TILE_SIZE), Math.floor((x + PLAYER_WIDTH - 0.001) / TILE_SIZE)];
    expect(cols.some((c) => isFloor(world, c, row))).toBe(true);
  }

  it('happens at the bed when it has room to stand', () => {
    const world = bedWorld();
    const spot = findRespawn(world, { tx: 10, ty: FLOOR - 1 });
    expect(spot.atBed).toBe(true);
    expect(spot.x + PLAYER_WIDTH / 2).toBe(11 * TILE_SIZE);
    expect(spot.y + PLAYER_HEIGHT).toBe(FLOOR * TILE_SIZE);
    expectSafe(world, spot.x, spot.y);
  });

  it('falls back to a safe spot near the world spawn when the bed is blocked or gone', () => {
    const blocked = bedWorld();
    fill(blocked, 10, FLOOR - 3, 11, FLOOR - 2, Tile.Stone); // a ceiling dropped right onto the bed
    const a = findRespawn(blocked, { tx: 10, ty: FLOOR - 1 });
    expect(a.atBed).toBe(false);
    expectSafe(blocked, a.x, a.y);
    expect(Math.abs(a.x / TILE_SIZE - blocked.spawnTx)).toBeLessThan(2);

    const gone = bedWorld();
    gone.setTile(10, FLOOR - 1, Tile.Air);
    const b = findRespawn(gone, { tx: 10, ty: FLOOR - 1 });
    expect(b.atBed).toBe(false);
    expectSafe(gone, b.x, b.y);

    expect(findRespawn(gone, null).atBed).toBe(false);
  });

  it('never falls back into a sealed room or a pillar built over the spawn', () => {
    const world = flatWorld();
    fill(world, 28, 0, 32, FLOOR - 1, Tile.Stone); // the spawn columns are solid to the sky
    const spot = findRespawn(world, null);
    expectSafe(world, spot.x, spot.y);
    const column = Math.floor((spot.x + PLAYER_WIDTH / 2) / TILE_SIZE);
    expect(column < 28 || column > 32).toBe(true);
  });
});

describe('saving health, beds and satchels', () => {
  function survival(): SurvivalState {
    const health = new Health(MAX_HEALTH);
    health.hurt(3, 40, 'normal');
    return {
      health,
      difficulty: 'normal',
      bed: { tx: 10, ty: FLOOR - 1 },
      satchels: [
        { x: 100, y: 200, stacks: [{ item: 'coal', count: 30 }] },
        { x: 300, y: 400, stacks: [{ item: 'gold_ore', count: 5 }, { item: 'torch', count: 2 }] },
      ],
    };
  }

  it('round-trips HP, timers, difficulty, the bed and every satchel', () => {
    const world = flatWorld();
    const state = survival();
    const save = structuredClone(createSave(world, new Player(5, 5), new Inventory(), [], undefined, { survival: state })) as SaveData;
    expect(restoreDifficulty(save)).toBe('normal');
    expect(restoreHealth(save, MAX_HEALTH).saved()).toEqual(state.health.saved());
    expect(restoreBed(save.bed, world)).toEqual(state.bed);
    expect(restoreSatchels(save.satchels, world)).toEqual(state.satchels);
    expect(metaFromSave('1', save).difficulty).toBe('normal');
  });

  it('keeps two satchels through an export and import', () => {
    const world = flatWorld();
    const save = createSave(world, new Player(5, 5), new Inventory(), [], undefined, { survival: survival() });
    const read = readBackup(backupText(save));
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect(restoreSatchels(read.save.satchels, world)).toHaveLength(2);
    expect(read.save.health).toEqual(save.health);
  });

  it('notices health, difficulty, bed and satchel changes for autosave', () => {
    const player = new Player(5, 5);
    const inv = new Inventory();
    const state = survival();
    const before = JSON.stringify(savedState(player, inv, [], undefined, state));
    const changes: ((s: SurvivalState) => void)[] = [
      (s) => s.health.hurt(1, 1000, 'normal'),
      (s) => (s.difficulty = 'cozy'),
      (s) => (s.bed = null),
      (s) => (s.satchels = s.satchels.slice(1)),
      (s) => (s.satchels[0].stacks[0].count = 1),
    ];
    for (const change of changes) {
      const copy = survival();
      change(copy);
      expect(JSON.stringify(savedState(player, inv, [], undefined, copy))).not.toBe(before);
    }
  });

  it('loads worlds from before Phase 11b as Cozy, at full health, with no bed or satchels', () => {
    const world = flatWorld();
    const old = createSave(world, new Player(5, 5), new Inventory(), []);
    expect(old.difficulty).toBeUndefined();
    expect(restoreDifficulty(old)).toBe('cozy');
    expect(restoreHealth(old, MAX_HEALTH).hp).toBe(MAX_HEALTH);
    expect(restoreBed(old.bed, world)).toBeNull();
    expect(restoreSatchels(old.satchels, world)).toEqual([]);
    expect(metaFromSave('1', old).difficulty).toBeUndefined();
  });

  it('skips unreadable satchels and beds', () => {
    const world = flatWorld();
    expect(restoreSatchels([{ x: 1, y: 2, stacks: [{ item: 'nope', count: 1 }] }, null, { x: 'a' }], world)).toEqual([]);
    expect(restoreSatchels('junk', world)).toEqual([]);
    expect(restoreBed({ tx: 1.5, ty: 2 }, world)).toBeNull();
    expect(restoreBed({ tx: -4, ty: 2 }, world)).toBeNull();
  });
});
