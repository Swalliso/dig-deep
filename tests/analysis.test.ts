import { describe, expect, it } from 'vitest';
import { SURFACE_LEVEL } from '../src/config';
import { backupReport, measureBackup, playTimeLabel } from '../src/analysis/backupStats';
import { parseProfile, parseSeeds } from '../src/analysis/reports';
import { findVeins, MIN_CAVE, measureWorld, ORE_KINDS, worldReport } from '../src/analysis/worldStats';
import { Inventory } from '../src/systems/inventory';
import { createSave } from '../src/systems/save';
import { ExploredMap } from '../src/world/explored';
import { NEW_WORLD_PROFILE, STRATA_V2_PROFILE } from '../src/world/generate';
import { Tile, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const COAL = ORE_KINDS.findIndex((k) => k.tile === Tile.CoalOre);
const COPPER = ORE_KINDS.findIndex((k) => k.tile === Tile.CopperOre);

function fill(world: World, x0: number, y0: number, x1: number, y1: number, tile: TileId): void {
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) world.setTile(tx, ty, tile);
}

/**
 * A 64 x 64 world: grass on row 10 (row 14 in column 50, a dip), stone below, bedrock round the
 * edges, and strata starting at rows 20, 30, 40 and 50. In it:
 * - a 10 x 4 cave in the Stone Caverns (rows 22–25), with a 3-tile coal vein on its right wall
 *   (one tile faces the cave; the others join it at a corner) and a buried 2-tile copper vein;
 * - a 2-tile speck of air (too small to be a cave);
 * - a 5 x 6 cave across the Stone Caverns / Fungal Hollows boundary (rows 27–32);
 * - a 3 x 5 cave in the Topsoil that opens onto the dip in column 50: a cave mouth.
 */
function tinyWorld(): World {
  const world = new World(64, 64, 7);
  for (let tx = 0; tx < 64; tx++) world.surface[tx] = tx === 50 ? 14 : 10;
  for (let tx = 0; tx < 64; tx++) {
    world.setTile(tx, world.surface[tx], Tile.Grass);
    fill(world, tx, world.surface[tx] + 1, tx, 63, Tile.Stone);
  }
  world.strataTops = [20, 30, 40, 50].map((row) => new Int16Array(64).fill(row));
  fill(world, 5, 22, 14, 25, Tile.Air);
  world.setTile(15, 22, Tile.CoalOre);
  world.setTile(16, 22, Tile.CoalOre);
  world.setTile(17, 23, Tile.CoalOre);
  world.setTile(30, 26, Tile.CopperOre);
  world.setTile(31, 26, Tile.CopperOre);
  fill(world, 40, 24, 41, 24, Tile.Air);
  fill(world, 20, 27, 24, 32, Tile.Air);
  fill(world, 51, 12, 53, 16, Tile.Air);
  fill(world, 0, 63, 63, 63, Tile.Bedrock);
  fill(world, 0, 0, 0, 63, Tile.Bedrock);
  fill(world, 63, 0, 63, 63, Tile.Bedrock);
  world.spawnTx = 32;
  world.changedChunks.clear();
  return world;
}

describe('world report', () => {
  const stats = measureWorld(tinyWorld());
  const [topsoil, caverns, hollows, , magma] = stats.strata;

  it('counts ground tiles and open space per stratum', () => {
    expect(topsoil.volume).toBe(62 * 10 - 4); // column 50's ground starts 4 rows lower
    expect(caverns.volume).toBe(62 * 10);
    expect(magma.volume).toBe(62 * 13);
    expect(caverns.open).toBe(40 + 2 + 15);
  });

  it('finds caves inside each stratum, splitting one that crosses a boundary', () => {
    expect(MIN_CAVE).toBeGreaterThan(2);
    expect(caverns.caves).toEqual([40, 15]);
    expect(hollows.caves).toEqual([15]);
    expect(topsoil.caves).toEqual([15]);
  });

  it('counts ore veins and how much of them a cave shows', () => {
    expect(caverns.ores[COAL]).toEqual({ tiles: 3, veins: 1, exposedTiles: 1, exposedVeins: 1 });
    expect(caverns.ores[COPPER]).toEqual({ tiles: 2, veins: 1, exposedTiles: 0, exposedVeins: 0 });
    expect(hollows.ores.every((o) => o.tiles === 0)).toBe(true);
  });

  it('finds caves that open onto the sky', () => {
    expect(stats.mouths).toEqual([{ tx: 51, fromSpawn: 19, size: 15, deepest: 16 - SURFACE_LEVEL }]);
  });

  it('counts a cave under a gap in the grass (a cave mouth carved through the surface row) as a mouth', () => {
    const world = tinyWorld();
    world.setTile(8, 10, Tile.Air);
    fill(world, 8, 11, 8, 21, Tile.Air); // a shaft from the gap down into the Stone Caverns' cave
    const mouths = measureWorld(world).mouths;
    expect(mouths.map((m) => m.tx)).toEqual([8, 51]);
    expect(mouths[0]).toMatchObject({ size: 40 + 11, deepest: 25 - SURFACE_LEVEL });
  });

  it('prints a table per stratum', () => {
    const text = worldReport([stats]);
    for (const name of ['Topsoil', 'Stone Caverns', 'Fungal Hollows', 'Geode Depths', 'Magma Layer', 'Cave mouths']) {
      expect(text).toContain(`## ${name}`);
    }
    expect(text).toContain('| Coal: veins (mean size) | 1 (3.0) | 1 (3.0) |');
  });

  it('reads seeds from the command line', () => {
    expect(parseSeeds(['--seeds', '4,5'])).toEqual([4, 5]);
    expect(parseSeeds(['--seeds=9'])).toEqual([9]);
    expect(parseSeeds([])).toEqual([1, 2, 3, 4, 5]);
    expect(() => parseSeeds(['--seeds', 'x'])).toThrow();
  });

  it('reads the profile from the command line', () => {
    expect(parseProfile([])).toBe(NEW_WORLD_PROFILE);
    expect(parseProfile(['--profile', 'strata:2'])).toBe(STRATA_V2_PROFILE);
    expect(parseProfile(['--seeds', '1', '--profile=strata:2'])).toBe(STRATA_V2_PROFILE);
    expect(() => parseProfile(['--profile', 'strata:9'])).toThrow();
  });
});

describe('backup report', () => {
  /** The tiny world after some play: ore mined, rock dug, a torch placed, a few tiles seen. */
  function playedSave() {
    const world = tinyWorld();
    world.setTile(15, 22, Tile.Air); // coal, facing the cave
    world.setTile(17, 23, Tile.Air); // coal of the same vein, buried
    world.setTile(30, 26, Tile.Air); // copper, buried vein
    world.setTile(5, 21, Tile.Air); // stone above the cave
    world.setTile(6, 22, Tile.Torch); // in the cave: placed, not dug
    world.setTile(2, 10, Tile.Air); // grass
    const explored = new ExploredMap(world);
    explored.mark(1, 20);
    explored.mark(2, 20);
    explored.mark(1, 5); // sky: not ground
    const inventory = new Inventory();
    inventory.add('stone_pickaxe', 1);
    inventory.add('wooden_pickaxe', 1);
    inventory.add('coal', 5);
    const player = { x: 0, y: 0, fallTop: null, centerX: 0, centerY: 0 };
    const save = createSave(world, player, inventory, [], undefined, { explored, playTime: 125.4 });
    save.tileEntities = [{ tx: 3, ty: 11, kind: 'chest', slots: [{ item: 'copper_ore', count: 4 }, { item: 'dirt', count: 9 }, null] }];
    return save;
  }

  const generated = tinyWorld();
  const stats = measureBackup('r1-stone.json', playedSave(), generated, findVeins(generated));
  const [topsoil, caverns] = stats.strata;

  it('counts tiles dug and torches placed per stratum', () => {
    expect(topsoil.dug).toBe(1);
    expect(caverns.dug).toBe(4);
    expect(caverns.torches).toBe(1);
  });

  it('splits mined ore into veins a cave showed and buried ones', () => {
    expect(caverns.ores[COAL]).toEqual({ mined: 2, fromCaveVein: 2, facedCave: 1 });
    expect(caverns.ores[COPPER]).toEqual({ mined: 1, fromCaveVein: 0, facedCave: 0 });
  });

  it('counts explored ground and the deepest tile seen', () => {
    expect(caverns.explored).toBe(2);
    expect(topsoil.explored).toBe(0);
    expect(stats.deepestSeen).toBe(20 - SURFACE_LEVEL);
  });

  it('reads the best pickaxe, and ore carried and in chests', () => {
    expect(stats.pickaxe).toBe('Stone pickaxe');
    expect(stats.carried).toEqual({ coal: 5 });
    expect(stats.stored).toEqual({ copper_ore: 4 });
    expect(stats.playTime).toBeCloseTo(125.4);
  });

  it('prints a timeline and a section per backup', () => {
    expect(playTimeLabel(125.4)).toBe('2:05');
    expect(playTimeLabel(3909)).toBe('1:05:09');
    const text = backupReport([stats]);
    expect(text).toContain('| r1-stone.json | 7 | 2:05 | Stone pickaxe | -100 m | 5 | 3 | 66.7% | 1 |');
    expect(text).toContain('## r1-stone.json');
    expect(text).toContain('Carried: coal × 5. In chests: copper ore × 4.');
  });
});
