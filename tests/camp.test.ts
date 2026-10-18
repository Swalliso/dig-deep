import { describe, expect, it } from 'vitest';
import { PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from '../src/config';
import { overlapsSolid, Player } from '../src/entities/player';
import { campSpot, canPlace, itemForTile, primaryAction, tryPlace } from '../src/systems/building';
import { craft, nearbyStations, RECIPES } from '../src/systems/crafting';
import { findRespawn } from '../src/systems/death';
import { Inventory } from '../src/systems/inventory';
import { Lifts } from '../src/systems/lifts';
import { Health } from '../src/systems/health';
import { restoreTileEntities, savedState, savedTileEntities, type SaveData } from '../src/systems/save';
import { campPartners, campTopLeft, isWholeCamp } from '../src/world/camp';
import { TileEntities } from '../src/world/tileEntities';
import { Tile, tileDef, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const FLOOR = 40;

function fill(world: World, tx0: number, ty0: number, tx1: number, ty1: number, id: TileId): void {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) world.setTile(tx, ty, id);
}

/** Flat stone ground at row FLOOR, spawn at column 30 standing on it. */
function flatWorld(): World {
  const world = new World(60, 60, 0);
  fill(world, 0, FLOOR, 59, 59, Tile.Stone);
  world.spawnTx = 30;
  world.spawnTy = FLOOR - 1;
  return world;
}

/** A camp set up with its top-left at (10, FLOOR - 2), placed by a player standing beside it. */
function campWorld(): { world: World; player: Player } {
  const world = flatWorld();
  const player = new Player(12, FLOOR - 1);
  const inventory = new Inventory();
  inventory.slots[0] = { item: 'camp_kit', count: 1 };
  expect(tryPlace(world, player, inventory, 10, FLOOR - 1)).toBe(true);
  expect(inventory.count('camp_kit')).toBe(0);
  return { world, player };
}

describe('setting up the camp', () => {
  it('needs a 2 x 2 space with solid ground under both bottom tiles, from any tile the cursor is on', () => {
    const world = flatWorld();
    const player = new Player(12, FLOOR - 1);
    expect(campSpot(world, player, 10, FLOOR - 1)).toEqual([10, FLOOR - 2]); // cursor on the bottom left
    expect(campSpot(world, player, 11, FLOOR - 1)).toEqual([11, FLOOR - 2]);
    expect(campSpot(world, player, 10, FLOOR - 2)).toEqual([10, FLOOR - 2]); // on a top tile, it still sits on the floor
    expect(campSpot(world, player, 10, FLOOR - 3)).toBeNull(); // too high above the floor
    world.setTile(11, FLOOR, Tile.Air); // a hole under one of the bottom tiles
    expect(campSpot(world, player, 11, FLOOR - 1)).toBeNull();
    expect(canPlace(world, player, 11, FLOOR - 1, Tile.CampTopLeft)).toBe(false);
    expect(campSpot(world, player, 12, FLOOR - 1)).toEqual([12, FLOOR - 2]); // beside the hole it fits
    world.setTile(13, FLOOR - 2, Tile.Torch); // something in the way
    expect(campSpot(world, player, 12, FLOOR - 1)).toBeNull();
    expect(campSpot(world, new Player(40, FLOOR - 1), 10, FLOOR - 1)).toBeNull(); // out of reach
  });

  it('places all four parts, which find each other, and it can overlap the player', () => {
    const { world, player } = campWorld();
    expect(isWholeCamp(world, 10, FLOOR - 2)).toBe(true);
    for (const [x, y] of [[10, FLOOR - 2], [11, FLOOR - 2], [10, FLOOR - 1], [11, FLOOR - 1]]) {
      expect(campTopLeft(world, x, y)).toEqual([10, FLOOR - 2]);
      expect(tileDef(world.getTile(x, y)).solid).toBe(false);
      expect(tileDef(world.getTile(x, y)).drop).toBe('camp_kit');
    }
    expect(overlapsSolid(world, player.x, player.y)).toBe(false);
  });

  it('is a held block like any other: left-click places it, middle-click picks it', () => {
    expect(primaryAction('camp_kit', Tile.Air)).toBe('build');
    expect(itemForTile(Tile.CampBottomRight)).toBe('camp_kit');
  });

  it('packs up whole when any part breaks', () => {
    const { world } = campWorld();
    world.setTile(11, FLOOR - 1, Tile.Air); // the bottom-right part was mined
    expect(campPartners(world, 11, FLOOR - 1, Tile.CampBottomRight)).toEqual([
      [10, FLOOR - 2],
      [11, FLOOR - 2],
      [10, FLOOR - 1],
    ]);
    expect(isWholeCamp(world, 10, FLOOR - 2)).toBe(false);
  });

  it('is crafted from a workbench, a furnace, a bed and iron', () => {
    const recipe = RECIPES.find((r) => r.output === 'camp_kit')!;
    const inventory = new Inventory();
    for (const [item, count] of [['workbench', 1], ['furnace', 1], ['bed', 1], ['iron_bar', 2]] as const) inventory.add(item, count);
    expect(craft(inventory, recipe, new Set(['workbench']))).toBe(true);
    expect(inventory.count('camp_kit')).toBe(1);
    expect(inventory.count('bed') + inventory.count('workbench') + inventory.count('furnace') + inventory.count('iron_bar')).toBe(0);
  });
});

describe('the camp as a station', () => {
  it('counts as a workbench and a furnace', () => {
    const { world } = campWorld();
    const stations = nearbyStations(world, (13 + 0.5) * TILE_SIZE, (FLOOR - 1) * TILE_SIZE);
    expect([...stations].sort()).toEqual(['furnace', 'workbench']);
    expect(nearbyStations(world, 40 * TILE_SIZE, (FLOOR - 1) * TILE_SIZE).size).toBe(0);
  });
});

describe('respawning at the camp', () => {
  const camp = { tx: 10, ty: FLOOR - 2 };

  it('happens at the camp, standing on its floor, when it was set last', () => {
    const { world } = campWorld();
    const spot = findRespawn(world, null, camp, 'camp');
    expect(spot).toMatchObject({ atCamp: true, atBed: false });
    expect(spot.x + PLAYER_WIDTH / 2).toBe(11 * TILE_SIZE);
    expect(spot.y + PLAYER_HEIGHT).toBe(FLOOR * TILE_SIZE);
    expect(overlapsSolid(world, spot.x, spot.y)).toBe(false);
  });

  it('goes to the bed or the camp, whichever was set last, and to the other if that one is gone', () => {
    const { world } = campWorld();
    world.setTile(30, FLOOR - 1, Tile.BedLeft);
    world.setTile(31, FLOOR - 1, Tile.BedRight);
    const bed = { tx: 30, ty: FLOOR - 1 };
    expect(findRespawn(world, bed, camp, 'bed').atBed).toBe(true);
    expect(findRespawn(world, bed, camp, 'camp').atCamp).toBe(true);
    world.setTile(30, FLOOR - 1, Tile.Air); // the bed is gone: the camp
    expect(findRespawn(world, bed, camp, 'bed').atCamp).toBe(true);
    world.setTile(30, FLOOR - 1, Tile.BedLeft);
    fill(world, 10, FLOOR - 2, 11, FLOOR - 1, Tile.Air); // the camp was packed up: the bed
    expect(findRespawn(world, bed, camp, 'camp').atBed).toBe(true);
  });

  it('falls back near the world spawn when the camp is blocked and there is no bed', () => {
    const { world } = campWorld();
    fill(world, 10, FLOOR - 4, 11, FLOOR - 3, Tile.Stone);
    world.setTile(10, FLOOR - 3, Tile.Air);
    fill(world, 9, FLOOR - 3, 12, FLOOR - 3, Tile.Stone); // a slab right on top of it
    const spot = findRespawn(world, null, camp, 'camp');
    expect(spot).toMatchObject({ atCamp: true }); // the camp itself still has room (it's two tiles tall)
    world.setTile(10, FLOOR - 2, Tile.Stone); // a block dropped inside it breaks it
    expect(findRespawn(world, null, camp, 'camp')).toMatchObject({ atCamp: false, atBed: false });
  });
});

describe('saving the camp', () => {
  it('keeps the camp marker only on a camp top-left, and the respawn choice only when it is the camp', () => {
    const { world } = campWorld();
    const entities = new TileEntities(world);
    entities.set(10, FLOOR - 2, { kind: 'camp' });
    const saved = savedTileEntities(entities);
    expect(saved).toEqual([{ tx: 10, ty: FLOOR - 2, kind: 'camp' }]);
    const save = { tileEntities: [...saved, { tx: 11, ty: FLOOR - 2, kind: 'camp' }] } as unknown as SaveData;
    expect(restoreTileEntities(save, world).entries().map(({ tx, ty }) => [tx, ty])).toEqual([[10, FLOOR - 2]]);

    const survival = { health: new Health(10), difficulty: 'normal' as const, bed: null, satchels: [], lifts: new Lifts() };
    const player = new Player(12, FLOOR - 1);
    expect(savedState(player, new Inventory(), [], entities, { ...survival, respawnAt: 'camp' }).respawnAt).toBe('camp');
    expect('respawnAt' in savedState(player, new Inventory(), [], entities, { ...survival, respawnAt: 'bed' })).toBe(false);
  });
});
