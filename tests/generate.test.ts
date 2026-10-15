import { beforeAll, describe, expect, it } from 'vitest';
import { BEDROCK_BOTTOM_ROWS, SURFACE_AMPLITUDE, SURFACE_LEVEL, WORLD_HEIGHT, WORLD_WIDTH } from '../src/config';
import { generateWorld, ORE_LAYERS } from '../src/world/generate';
import { Tile, TILES, tileDef } from '../src/world/tiles';
import type { World } from '../src/world/world';

const SEEDS = [1, 42, 987654321];

function countTiles(world: World, id: number): number {
  let n = 0;
  for (let ty = 0; ty < world.height; ty++) {
    for (let tx = 0; tx < world.width; tx++) if (world.getTile(tx, ty) === id) n++;
  }
  return n;
}

describe('tile registry', () => {
  it('stores each tile at the index of its id', () => {
    TILES.forEach((def, i) => expect(def.id).toBe(i));
  });
});

describe.each(SEEDS)('world from seed %i', (seed) => {
  let world: World;
  beforeAll(() => {
    world = generateWorld(seed);
  });

  it('has the configured size', () => {
    expect(world.width).toBe(WORLD_WIDTH);
    expect(world.height).toBe(WORLD_HEIGHT);
  });

  it('has bedrock along both side columns', () => {
    for (let ty = 0; ty < world.height; ty++) {
      expect(world.getTile(0, ty)).toBe(Tile.Bedrock);
      expect(world.getTile(world.width - 1, ty)).toBe(Tile.Bedrock);
    }
  });

  it('has bedrock across the bottom rows', () => {
    for (let ty = world.height - BEDROCK_BOTTOM_ROWS; ty < world.height; ty++) {
      for (let tx = 0; tx < world.width; tx++) expect(world.getTile(tx, ty)).toBe(Tile.Bedrock);
    }
  });

  it('has no bedrock anywhere else', () => {
    for (let ty = 0; ty < world.height - BEDROCK_BOTTOM_ROWS; ty++) {
      for (let tx = 1; tx < world.width - 1; tx++) {
        if (world.getTile(tx, ty) === Tile.Bedrock) throw new Error(`stray bedrock at (${tx}, ${ty})`);
      }
    }
  });

  it('places every ore only inside its depth range', () => {
    const ranges = new Map(ORE_LAYERS.map((o) => [o.tile as number, o.spec]));
    for (let ty = 0; ty < world.height; ty++) {
      const depth = ty - SURFACE_LEVEL;
      for (let tx = 0; tx < world.width; tx++) {
        const spec = ranges.get(world.getTile(tx, ty));
        if (spec && (depth < spec.minDepth || depth > spec.maxDepth)) {
          throw new Error(`${tileDef(world.getTile(tx, ty)).name} at depth ${depth} (${tx}, ${ty})`);
        }
      }
    }
  });

  it('places some of every ore', () => {
    for (const { tile } of ORE_LAYERS) expect(countTiles(world, tile)).toBeGreaterThan(50);
  });

  it('keeps the surface within the hill amplitude', () => {
    for (let tx = 0; tx < world.width; tx++) {
      expect(Math.abs(world.surface[tx] - SURFACE_LEVEL)).toBeLessThanOrEqual(SURFACE_AMPLITUDE);
    }
  });

  it('has caves, trees and deepstone', () => {
    let caveAir = 0;
    for (let tx = 1; tx < world.width - 1; tx++) {
      for (let ty = world.surface[tx] + 1; ty < world.height; ty++) {
        if (world.getTile(tx, ty) === Tile.Air) caveAir++;
      }
    }
    expect(caveAir).toBeGreaterThan(1000);
    expect(countTiles(world, Tile.Wood)).toBeGreaterThan(0);
    expect(countTiles(world, Tile.Leaves)).toBeGreaterThan(0);
    expect(countTiles(world, Tile.Deepstone)).toBeGreaterThan(0);
  });

  it('spawns in the middle column, standing on solid ground', () => {
    expect(world.spawnTx).toBe(Math.floor(world.width / 2));
    expect(tileDef(world.getTile(world.spawnTx, world.spawnTy)).solid).toBe(false);
    expect(tileDef(world.getTile(world.spawnTx, world.spawnTy + 1)).solid).toBe(true);
    expect(Math.abs(world.spawnTy + 1 - world.surface[world.spawnTx])).toBeLessThanOrEqual(1);
  });
});

describe('determinism', () => {
  it('gives an identical world for the same seed', () => {
    const a = generateWorld(2024);
    const b = generateWorld(2024);
    for (let i = 0; i < a.chunks.length; i++) expect(b.chunks[i]).toEqual(a.chunks[i]);
    expect(b.hash()).toBe(a.hash());
    expect(b.spawnTy).toBe(a.spawnTy);
  });

  it('gives a different world for a different seed', () => {
    expect(generateWorld(2024).hash()).not.toBe(generateWorld(2025).hash());
  });
});

describe('performance', () => {
  it('generates a full world in under 2 seconds', () => {
    const start = performance.now();
    generateWorld(7);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
