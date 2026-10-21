import { beforeAll, describe, expect, it } from 'vitest';
import { BANNER_HYSTERESIS, PICKAXES, STRATA_GEN, SURFACE_LEVEL } from '../src/config';
import { nextStratumSpot } from '../src/debug';
import { RECIPES } from '../src/systems/crafting';
import { nextPickaxe, pickaxeNote, whereFound } from '../src/systems/goal';
import { itemDef, type ItemId } from '../src/systems/items';
import { CLASSIC_PROFILE, generateWorld, GRAVEL_PROFILE, STRATA_ORES, STRATA_V2_PROFILE } from '../src/world/generate';
import { bannerTitle, depthRange, STRATA, StratumTracker, stratumAt } from '../src/world/strata';
import { isSolid, Tile, TILES, tileDef, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const SEEDS = [1, 42, 987654321];

/** How many of each tile each stratum holds: counts[stratum][tile id]. */
function countByStratum(world: World): number[][] {
  const counts = STRATA.map(() => new Array<number>(TILES.length).fill(0));
  for (let ty = 0; ty < world.height; ty++) {
    for (let tx = 0; tx < world.width; tx++) counts[stratumAt(world, tx, ty)][world.getTile(tx, ty)]++;
  }
  return counts;
}

/** The strata (indices) a tile turns up in. */
function strataWith(counts: number[][], tile: TileId): number[] {
  return counts.flatMap((row, s) => (row[tile] > 0 ? [s] : []));
}

/** Sizes of the connected open areas inside stratum `s`, biggest first. */
function openAreas(world: World, s: number): number[] {
  const seen = new Uint8Array(world.width * world.height);
  const sizes: number[] = [];
  for (let ty = 0; ty < world.height; ty++) {
    for (let tx = 0; tx < world.width; tx++) {
      const start = ty * world.width + tx;
      if (seen[start] || world.getTile(tx, ty) !== Tile.Air || stratumAt(world, tx, ty) !== s) continue;
      seen[start] = 1;
      const queue = [start];
      let size = 0;
      while (queue.length > 0) {
        const i = queue.pop()!;
        size++;
        const x = i % world.width;
        const y = (i - x) / world.width;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const j = ny * world.width + nx;
          if (!world.inBounds(nx, ny) || seen[j] || world.getTile(nx, ny) !== Tile.Air || stratumAt(world, nx, ny) !== s) continue;
          seen[j] = 1;
          queue.push(j);
        }
      }
      sizes.push(size);
    }
  }
  return sizes.sort((a, b) => b - a);
}

describe.each(SEEDS)('strata world from seed %i', (seed) => {
  let world: World;
  let counts: number[][];
  beforeAll(() => {
    world = generateWorld(seed, STRATA_V2_PROFILE);
    counts = countByStratum(world);
  });

  it('records its profile and a boundary per column between each pair of strata', () => {
    expect(world.profile).toEqual({ name: 'strata', version: 2 });
    expect(world.strataTops).toHaveLength(STRATA.length - 1);
    for (const tops of world.strataTops) expect(tops).toHaveLength(world.width);
  });

  it('keeps each boundary near its nominal depth and in order, with Topsoil reaching below the dirt', () => {
    // Problems are collected and checked once: an expect per tile is far too slow on CI runners.
    const { tops, jitter } = STRATA_GEN;
    const problems: string[] = [];
    for (let tx = 0; tx < world.width; tx++) {
      const first = world.strataTops[0][tx];
      if (first - SURFACE_LEVEL < tops[0] - jitter) problems.push(`Topsoil ends too high at column ${tx}`);
      for (let ty = first; ty < world.height; ty++) {
        const tile = world.getTile(tx, ty);
        if (tile === Tile.Dirt || tile === Tile.Grass) problems.push(`soil below Topsoil at (${tx}, ${ty})`);
      }
      for (let k = 1; k < tops.length; k++) {
        if (Math.abs(world.strataTops[k][tx] - SURFACE_LEVEL - tops[k]) > jitter) problems.push(`boundary ${k} strays at column ${tx}`);
        if (world.strataTops[k][tx] <= world.strataTops[k - 1][tx]) problems.push(`boundary ${k} out of order at column ${tx}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("fills each stratum with its own rock: dirt over stone in Topsoil, then stone, mudstone, deepstone and basalt", () => {
    expect(strataWith(counts, Tile.Dirt)).toEqual([0]);
    expect(strataWith(counts, Tile.Grass)).toEqual([0]);
    expect(strataWith(counts, Tile.Stone)).toEqual([0, 1]);
    expect(strataWith(counts, Tile.Mudstone)).toEqual([2]);
    expect(strataWith(counts, Tile.Deepstone)).toEqual([3]);
    expect(strataWith(counts, Tile.Basalt)).toEqual([4]);
    for (let s = 1; s < STRATA.length; s++) {
      // The rock is most of each stratum (the rest is caves, ore and growths).
      const total = counts[s].reduce((a, b) => a + b, 0);
      expect(counts[s][STRATA[s].rock] / total, STRATA[s].name).toBeGreaterThan(0.6);
    }
  });

  it("places every ore only in its own stratum, and plenty of each", () => {
    for (const { tile, spec } of STRATA_ORES) {
      expect(strataWith(counts, tile), tileDef(tile).name).toEqual([spec.stratum]);
    }
    const total = (tile: TileId): number => counts.reduce((n, row) => n + row[tile], 0);
    expect(total(Tile.CoalOre)).toBeGreaterThan(500);
    expect(total(Tile.CopperOre)).toBeGreaterThan(400);
    expect(total(Tile.IronOre)).toBeGreaterThan(400);
    expect(total(Tile.GoldOre)).toBeGreaterThan(300);
    expect(total(Tile.RubyOre)).toBeGreaterThan(60);
    expect(total(Tile.SapphireOre)).toBeGreaterThan(60);
    expect(total(Tile.EmberiteOre)).toBeGreaterThan(250);
  });

  it('keeps gravel to the Stone Caverns and the Fungal Hollows', () => {
    expect(strataWith(counts, Tile.Gravel)).toEqual([1, 2]);
    expect(counts[1][Tile.Gravel] + counts[2][Tile.Gravel]).toBeGreaterThan(2000);
  });

  it("grows glowshrooms and giant mushrooms on the Fungal Hollows' floors", () => {
    expect(strataWith(counts, Tile.Glowshroom)).toEqual([2]);
    expect(strataWith(counts, Tile.MushroomStem)).toEqual([2]);
    expect(strataWith(counts, Tile.MushroomCap)).toEqual([2]);
    expect(counts[2][Tile.Glowshroom]).toBeGreaterThan(250);
    let mushrooms = 0;
    const problems: string[] = [];
    for (let ty = 0; ty < world.height; ty++) {
      for (let tx = 0; tx < world.width; tx++) {
        const tile = world.getTile(tx, ty);
        if (tile === Tile.Glowshroom && world.getTile(tx, ty + 1) !== Tile.Mudstone) problems.push(`glowshroom off mudstone at (${tx}, ${ty})`);
        if (tile !== Tile.MushroomStem || world.getTile(tx, ty + 1) === Tile.MushroomStem) continue;
        // The bottom of a stem stands on mudstone, with a cap on its top.
        mushrooms++;
        if (world.getTile(tx, ty + 1) !== Tile.Mudstone) problems.push(`stem off mudstone at (${tx}, ${ty})`);
        let top = ty;
        while (world.getTile(tx, top - 1) === Tile.MushroomStem) top--;
        if (world.getTile(tx, top - 1) !== Tile.MushroomCap) problems.push(`stem without a cap at (${tx}, ${top})`);
      }
    }
    expect(problems).toEqual([]);
    expect(mushrooms).toBeGreaterThan(15);
  });

  it('lines the Geode Depths with glow crystals around huge open caverns', () => {
    expect(strataWith(counts, Tile.GlowCrystal)).toEqual([3]);
    expect(counts[3][Tile.GlowCrystal]).toBeGreaterThan(300);
    // Several open areas far bigger than the caves above.
    const geode = openAreas(world, 3);
    expect(geode.filter((size) => size >= 600).length).toBeGreaterThanOrEqual(5);
    expect(geode[0]).toBeGreaterThan(openAreas(world, 2)[0]);
  });
});

describe('the strata profile', () => {
  it('is deterministic', () => {
    const a = generateWorld(2024, STRATA_V2_PROFILE);
    const b = generateWorld(2024, STRATA_V2_PROFILE);
    expect(b.hash()).toBe(a.hash());
    expect(b.strataTops).toEqual(a.strataTops);
    expect(generateWorld(2025, STRATA_V2_PROFILE).hash()).not.toBe(a.hash());
  });

  it("keeps the surface the same as older worlds': hills, dirt, grass, trees and the spawn point", () => {
    const strata = generateWorld(42, STRATA_V2_PROFILE);
    const gravel = generateWorld(42, GRAVEL_PROFILE);
    expect(strata.surface).toEqual(gravel.surface);
    expect([strata.spawnTx, strata.spawnTy]).toEqual([gravel.spawnTx, gravel.spawnTy]);
    const above = [Tile.Dirt, Tile.Grass, Tile.Wood, Tile.Leaves];
    const changed: string[] = [];
    for (let ty = 0; ty < strata.height; ty++) {
      for (let tx = 0; tx < strata.width; tx++) {
        const was = gravel.getTile(tx, ty);
        if ((above as number[]).includes(was) && strata.getTile(tx, ty) !== was) changed.push(`(${tx}, ${ty})`);
      }
    }
    expect(changed).toEqual([]);
  });

  it('generates in under 2 seconds', () => {
    const start = performance.now();
    generateWorld(7, STRATA_V2_PROFILE);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('worlds from older profiles have no strata', () => {
    const world = generateWorld(3, CLASSIC_PROFILE);
    expect(world.strataTops).toEqual([]);
    expect(stratumAt(world, 500, 300)).toBe(-1);
  });
});

describe('stratum tracking', () => {
  it('names each stratum with its depth for the entry banner', () => {
    expect(STRATA.map((s) => s.name)).toEqual(['Topsoil', 'Stone Caverns', 'Fungal Hollows', 'Geode Depths', 'Magma Layer']);
    expect(bannerTitle(2)).toBe('Fungal Hollows — 110 m');
    expect(depthRange(3)).toBe('230–350 m');
    expect(depthRange(4)).toBe('from 350 m');
  });

  it(`only counts a stratum as entered ${BANNER_HYSTERESIS} tiles past its boundary`, () => {
    const world = generateWorld(42, STRATA_V2_PROFILE);
    const tx = 500;
    const boundary = world.strataTops[1][tx]; // the Fungal Hollows' top
    const tracker = new StratumTracker(world, tx, boundary - 10);
    expect(tracker.current).toBe(1);
    expect(tracker.update(world, tx, boundary)).toBeNull(); // on the boundary: not yet
    expect(tracker.update(world, tx, boundary + BANNER_HYSTERESIS - 1)).toBeNull();
    expect(tracker.update(world, tx, boundary + BANNER_HYSTERESIS)).toBe(2);
    expect(tracker.update(world, tx, boundary + 5)).toBeNull(); // already in
    expect(tracker.update(world, tx, boundary - 1)).toBeNull(); // just back over: not yet
    expect(tracker.update(world, tx, boundary - 1 - BANNER_HYSTERESIS)).toBe(1);
  });
});

describe('debug: next stratum', () => {
  it('goes to the top of each stratum in turn, standing in open space, then back to the spawn', () => {
    const world = generateWorld(42, STRATA_V2_PROFILE);
    let tx = world.spawnTx;
    let ty = world.spawnTy;
    for (let s = 1; s < STRATA.length; s++) {
      const spot = nextStratumSpot(world, tx, ty)!;
      expect(spot.stratum).toBe(s);
      expect(stratumAt(world, spot.tx, spot.ty)).toBe(s);
      expect(stratumAt(world, spot.tx, spot.ty - 1)).toBe(s);
      expect(isSolid(world.getTile(spot.tx, spot.ty))).toBe(false);
      expect(isSolid(world.getTile(spot.tx, spot.ty - 1))).toBe(false);
      expect(spot.ty - world.strataTops[s - 1][spot.tx]).toBeLessThan(32);
      ({ tx, ty } = spot);
    }
    expect(nextStratumSpot(world, tx, ty)).toEqual({ tx: world.spawnTx, ty: world.spawnTy, stratum: 0 });
  });

  it('does nothing in a world without strata', () => {
    expect(nextStratumSpot(generateWorld(3, CLASSIC_PROFILE), 500, 200)).toBeNull();
  });
});

describe('progression through the strata', () => {
  let counts: number[][];
  beforeAll(() => {
    counts = countByStratum(generateWorld(42, STRATA_V2_PROFILE));
  });

  /**
   * The best pickaxe tier reachable using only what strata 0..last hold: mine every tile there
   * that the best pickaxe so far can mine, craft everything those materials allow, and repeat.
   */
  function bestTierFrom(last: number): number {
    const have = new Set<ItemId>(['wooden_pickaxe']);
    let tier = 0;
    for (let changed = true; changed; ) {
      changed = false;
      const add = (item: ItemId | null): void => {
        if (item && !have.has(item)) {
          have.add(item);
          changed = true;
        }
      };
      for (let s = 0; s <= last; s++) {
        counts[s].forEach((n, id) => {
          if (n > 0 && id !== Tile.Air && tileDef(id).minTier <= tier) {
            add(tileDef(id).drop);
            add(tileDef(id).chanceDrop?.item ?? null);
          }
        });
      }
      for (const recipe of RECIPES) if (recipe.ingredients.every((i) => have.has(i.item))) add(recipe.output);
      for (const item of have) tier = Math.max(tier, itemDef(item).pickaxeTier ?? 0);
    }
    return tier;
  }

  it("mines each stratum's rock and ores with the best pickaxe made from the strata above it", () => {
    for (let s = 1; s < STRATA.length; s++) {
      const tier = bestTierFrom(s - 1);
      expect(tileDef(STRATA[s].rock).minTier, STRATA[s].name).toBeLessThanOrEqual(tier);
      for (const { tile, spec } of STRATA_ORES) {
        if (spec.stratum === s) expect(tileDef(tile).minTier, tileDef(tile).name).toBeLessThanOrEqual(tier);
      }
    }
    // Each stratum's ore makes the next pickaxe: stone, copper, iron, gold, then emberite.
    expect([0, 1, 2, 3, 4].map(bestTierFrom)).toEqual([1, 2, 3, 4, 5]);
    expect(PICKAXES[5].name).toBe('Emberite');
  });

  it('gives every material a use: whatever a tile drops is placed, crafted with, or a tool', () => {
    const used = (item: ItemId): boolean =>
      itemDef(item).placeTile !== null ||
      itemDef(item).pickaxeTier !== undefined ||
      RECIPES.some((r) => r.ingredients.some((i) => i.item === item));
    for (const def of TILES) {
      for (const item of [def.drop, def.chanceDrop?.item ?? null]) if (item) expect(used(item), item).toBe(true);
    }
    const usesOf = (item: ItemId): number => RECIPES.filter((r) => r.ingredients.some((i) => i.item === item)).length;
    expect(usesOf('gold_bar')).toBeGreaterThanOrEqual(3); // the gold pickaxe and both gem lamps
    for (const item of ['ruby', 'sapphire', 'stone', 'mudstone', 'deepstone', 'basalt', 'emberite_ore'] as const) {
      expect(usesOf(item), item).toBeGreaterThan(0);
    }
  });

  it("says where each stratum's materials are found", () => {
    expect(whereFound('iron_ore', STRATA_V2_PROFILE)).toBe('Fungal Hollows, 110–230 m down');
    expect(whereFound('ruby', STRATA_V2_PROFILE)).toBe('Geode Depths, 230–350 m down');
    expect(whereFound('emberite_ore', STRATA_V2_PROFILE)).toBe('Magma Layer, from 350 m down');
    expect(whereFound('mudstone', STRATA_V2_PROFILE)).toBe('Fungal Hollows, 110–230 m down');
    expect(whereFound('wood', STRATA_V2_PROFILE)).toBe('from trees and giant mushrooms');
    expect(whereFound('stone', STRATA_V2_PROFILE)).toBe('under the dirt');
    expect(whereFound('emberite_ore')).toBeNull(); // not in worlds from before strata
  });

  it('suggests the emberite pickaxe after gold in a strata world, but not in an older one', () => {
    const next = nextPickaxe(4, STRATA_V2_PROFILE)!;
    expect(next.recipe.output).toBe('emberite_pickaxe');
    expect(pickaxeNote(next, STRATA_V2_PROFILE)).toBe('Emberite ore: Magma Layer, from 350 m down, smelted at a furnace');
    expect(nextPickaxe(4, GRAVEL_PROFILE)).toBeNull();
    expect(nextPickaxe(5, STRATA_V2_PROFILE)).toBeNull();
    expect(nextPickaxe(1, STRATA_V2_PROFILE)?.ore).toBe('copper_ore');
  });
});
