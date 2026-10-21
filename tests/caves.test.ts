import { beforeAll, describe, expect, it } from 'vitest';
import { CAVE_SYSTEMS, SAFE_FALL_TILES, SURFACE_LEVEL } from '../src/config';
import { facesCave, measureWorld, ORE_KINDS, SCREEN_TILES, type WorldStats } from '../src/analysis/worldStats';
import { firstCavernWalkable, inFirstCavern } from '../src/world/caveSystems';
import { generateWorld, NEW_WORLD_PROFILE, STRATA_V2_PROFILE, STRATA_V3_PROFILE } from '../src/world/generate';
import { stratumAt } from '../src/world/strata';
import { isSolid, Tile, type TileId } from '../src/world/tiles';
import { SAFE_WALK, standsAt, walkTo, type WalkBox } from '../src/world/walkable';
import { World } from '../src/world/world';

// Package B1: strata v3's cave systems, and the walk check generation uses for the first cave
// mouth. Each real-world test generates one or two worlds, so they stay well under Vitest's 5 s.

function fill(world: World, x0: number, y0: number, x1: number, y1: number, tile: TileId): void {
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) world.setTile(tx, ty, tile);
}

describe('walking on foot', () => {
  /** A 64 x 40 box of stone with an open room from row 5 to row 29: the floor is row 30. */
  function room(): World {
    const world = new World(64, 40, 1);
    fill(world, 0, 0, 63, 39, Tile.Stone);
    fill(world, 1, 5, 62, 29, Tile.Air);
    return world;
  }
  const box: WalkBox = { x0: 0, y0: 0, x1: 63, y1: 39 };
  const at = (tx: number, ty: number) => (x: number, y: number): boolean => x === tx && y === ty;

  it('stands where its feet and head are open and the tile below is solid', () => {
    const world = room();
    expect(standsAt(world, 10, 29)).toBe(true);
    expect(standsAt(world, 10, 28)).toBe(false); // in the air
    world.setTile(10, 28, Tile.Stone);
    expect(standsAt(world, 10, 29)).toBe(false); // no headroom
  });

  it('walks along a floor and drops at most the safe fall height', () => {
    const world = room();
    expect(walkTo(world, 2, 29, at(60, 29), box)).toBe(true);
    // A ledge SAFE_FALL_TILES above the floor can be stepped off; one a tile higher can't.
    fill(world, 2, 29 - SAFE_FALL_TILES + 1, 10, 29, Tile.Stone);
    expect(walkTo(world, 3, 29 - SAFE_FALL_TILES, at(20, 29), box)).toBe(true);
    fill(world, 2, 29 - SAFE_FALL_TILES, 10, 29 - SAFE_FALL_TILES, Tile.Stone);
    expect(walkTo(world, 3, 29 - SAFE_FALL_TILES - 1, at(20, 29), box)).toBe(false);
  });

  it('climbs a step as high as a jump, but no higher', () => {
    const world = room();
    fill(world, 20, 30 - SAFE_WALK.jump, 30, 29, Tile.Stone);
    expect(walkTo(world, 10, 29, at(25, 29 - SAFE_WALK.jump), box)).toBe(true);
    world.setTile(20, 29 - SAFE_WALK.jump, Tile.Stone);
    expect(walkTo(world, 10, 29, at(25, 29 - SAFE_WALK.jump), box)).toBe(false);
  });

  it('needs headroom to jump', () => {
    const world = room();
    fill(world, 20, 28, 30, 29, Tile.Stone); // a 2-tile step...
    expect(walkTo(world, 15, 29, at(25, 27), box)).toBe(true);
    fill(world, 1, 26, 19, 26, Tile.Stone); // ...in a corridor too low to jump in
    expect(walkTo(world, 15, 29, at(25, 27), box)).toBe(false);
  });

  it('jumps a gap of up to rules.gap - 1 open columns', () => {
    const world = room();
    fill(world, 1, 5, 62, 29, Tile.Stone);
    fill(world, 1, 5, 62, 20, Tile.Air); // the floor is now row 21, with stone below it
    const gap = SAFE_WALK.gap - 1;
    fill(world, 30, 21, 29 + gap, 35, Tile.Air); // a deep hole gap columns wide
    expect(walkTo(world, 10, 20, at(50, 20), box)).toBe(true);
    world.setTile(30 + gap, 21, Tile.Air);
    fill(world, 30 + gap, 21, 30 + gap, 35, Tile.Air);
    expect(walkTo(world, 10, 20, at(50, 20), box)).toBe(false);
  });
});

describe('strata v3', () => {
  it('is what new worlds get, and is deterministic', () => {
    expect(NEW_WORLD_PROFILE).toBe(STRATA_V3_PROFILE);
    const a = generateWorld(2024, STRATA_V3_PROFILE);
    const b = generateWorld(2024, STRATA_V3_PROFILE);
    expect(a.profile).toEqual({ name: 'strata', version: 3 });
    expect(b.hash()).toBe(a.hash());
    expect(b.firstCavern).toEqual(a.firstCavern);
  });

  it('generates in under 2 seconds', () => {
    const start = performance.now();
    generateWorld(7, STRATA_V3_PROFILE);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("keeps strata v2's hills, strata, spawn point and amount of coal, copper and iron", () => {
    const v3 = generateWorld(42, STRATA_V3_PROFILE);
    const v2 = generateWorld(42, STRATA_V2_PROFILE);
    expect(v3.surface).toEqual(v2.surface);
    expect(v3.strataTops).toEqual(v2.strataTops);
    expect([v3.spawnTx, v3.spawnTy]).toEqual([v2.spawnTx, v2.spawnTy]);
    expect(v3.heart).toEqual(v2.heart);
    const count = (world: World, tile: TileId): number => {
      let n = 0;
      for (let ty = 0; ty < world.height; ty++) for (let tx = 0; tx < world.width; tx++) if (world.getTile(tx, ty) === tile) n++;
      return n;
    };
    // Veins per band are the same; the ore's random stream differs, so each world shifts a little.
    for (const { name, tile } of ORE_KINDS.slice(0, 3)) {
      const was = count(v2, tile);
      expect(Math.abs(count(v3, tile) - was), name).toBeLessThanOrEqual(was * 0.1);
    }
  });
});

describe.each([1, 2, 3, 4, 5, 42])('a strata v3 world from seed %i', (seed) => {
  let world: World;
  let stats: WorldStats;
  beforeAll(() => {
    world = generateWorld(seed, STRATA_V3_PROFILE);
    stats = measureWorld(world);
  });
  const open = (s: number): number => stats.strata[s].open / stats.strata[s].volume;
  const screens = (s: number): number => stats.strata[s].caves.filter((c) => c >= SCREEN_TILES).length;

  it('has caverns in the Stone Caverns and the Fungal Hollows', () => {
    // Per-world targets (ROADMAP.md, B1) are means over seeds 1-5; each world stays near them.
    expect(open(1)).toBeGreaterThan(0.14);
    expect(open(1)).toBeLessThan(0.21);
    expect(screens(1)).toBeGreaterThanOrEqual(1);
    expect(open(2)).toBeGreaterThan(0.2);
    expect(open(2)).toBeLessThan(0.26);
    expect(screens(2)).toBeGreaterThanOrEqual(3);
  });

  it('shows most of its coal, copper and iron veins on cave walls', () => {
    // The target is half or more over seeds 1-5 (npm run report:world); each world comes close.
    for (const [s, name] of [[1, 'Coal'], [1, 'Copper'], [2, 'Iron']] as const) {
      const ore = stats.strata[s].ores[ORE_KINDS.findIndex((k) => k.name === name)];
      expect(ore.exposedVeins / ore.veins, name).toBeGreaterThanOrEqual(0.45);
    }
  });

  it('has cave mouths, but none near the spawn itself', () => {
    expect(stats.mouths.length).toBeGreaterThanOrEqual(3);
    const keep = CAVE_SYSTEMS.mouths.nearMin - 10;
    for (let tx = world.spawnTx - keep; tx <= world.spawnTx + keep; tx++) {
      expect(isSolid(world.getTile(tx, world.surface[tx])), `column ${tx}`).toBe(true);
    }
  });

  it('has a first cavern near the spawn, walkable down from the surface and back', () => {
    const site = world.firstCavern!;
    expect(site).not.toBeNull();
    expect(Math.abs(site.mouthTx - world.spawnTx)).toBeLessThanOrEqual(100);
    expect(stratumAt(world, site.cx, site.cy)).toBe(1);
    expect(site.cy - SURFACE_LEVEL).toBeGreaterThanOrEqual(CAVE_SYSTEMS.firstCavern.depthMin);
    expect(site.cy - SURFACE_LEVEL).toBeLessThanOrEqual(CAVE_SYSTEMS.firstCavern.depthMax + 25);
    expect(firstCavernWalkable(world, site)).toBe(true);
  });

  it("shows a coal vein and a copper vein on the first cavern's walls", () => {
    const site = world.firstCavern!;
    const shown = new Set<TileId>();
    for (let ty = site.cy - site.ry - 2; ty <= site.cy + site.ry + 2; ty++) {
      for (let tx = site.cx - site.rx - 2; tx <= site.cx + site.rx + 2; tx++) {
        const near = inFirstCavern({ ...site, rx: site.rx + 2, ry: site.ry + 2 }, tx, ty);
        if (near && facesCave(world, tx, ty)) shown.add(world.getTile(tx, ty));
      }
    }
    expect(shown.has(Tile.CoalOre)).toBe(true);
    expect(shown.has(Tile.CopperOre)).toBe(true);
  });
});
