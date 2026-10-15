import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world/generate';
import { Tile } from '../src/world/tiles';
import { fellTreeAbove } from '../src/world/trees';
import { World } from '../src/world/world';

const GROUND = 30;

/** Tree with a trunk of `height` tiles at column tx and a 5x3 leaf canopy around its top. */
function plantTree(world: World, tx: number, height: number): void {
  for (let i = 1; i <= height; i++) world.setTile(tx, GROUND - i, Tile.Wood);
  const top = GROUND - height;
  for (let y = top - 2; y <= top; y++) {
    for (let x = tx - 2; x <= tx + 2; x++) if (world.getTile(x, y) === Tile.Air) world.setTile(x, y, Tile.Leaves);
  }
}

function count(world: World, id: number, x0 = 0, x1 = world.width - 1): number {
  let n = 0;
  for (let y = 0; y < world.height; y++) for (let x = x0; x <= x1; x++) if (world.getTile(x, y) === id) n++;
  return n;
}

function groundWorld(): World {
  const world = new World(40, 40, 0);
  for (let y = GROUND; y < 40; y++) for (let x = 0; x < 40; x++) world.setTile(x, y, Tile.Dirt);
  return world;
}

describe('felling trees', () => {
  it('removes the trunk above the cut and the whole canopy, leaving the stump', () => {
    const world = groundWorld();
    plantTree(world, 10, 6);
    const leaves = count(world, Tile.Leaves);
    world.setTile(10, GROUND - 3, Tile.Air); // the player cuts the third trunk tile

    const felled = fellTreeAbove(world, 10, GROUND - 3);
    expect(felled.filter((t) => t.tile === Tile.Wood)).toHaveLength(3);
    expect(felled.filter((t) => t.tile === Tile.Leaves)).toHaveLength(leaves);
    expect(count(world, Tile.Leaves)).toBe(0);
    expect(world.getTile(10, GROUND - 1)).toBe(Tile.Wood);
    expect(world.getTile(10, GROUND - 2)).toBe(Tile.Wood);
    expect(count(world, Tile.Wood)).toBe(2);
  });

  it('leaves a neighbouring tree alone', () => {
    const world = groundWorld();
    plantTree(world, 10, 5);
    plantTree(world, 16, 5);
    const neighbourLeaves = count(world, Tile.Leaves, 14, 18);
    world.setTile(10, GROUND - 1, Tile.Air);
    fellTreeAbove(world, 10, GROUND - 1);
    expect(count(world, Tile.Wood, 8, 12)).toBe(0);
    expect(count(world, Tile.Leaves, 14, 18)).toBe(neighbourLeaves);
    expect(count(world, Tile.Wood, 16, 16)).toBe(5);
  });

  it('fells every generated tree cleanly from its base', () => {
    const world = generateWorld(42);
    let trees = 0;
    for (let tx = 1; tx < world.width - 1 && trees < 25; tx++) {
      const base = world.surface[tx] - 1;
      if (world.getTile(tx, base) !== Tile.Wood) continue;
      trees++;
      world.setTile(tx, base, Tile.Air);
      fellTreeAbove(world, tx, base);
      for (let y = 0; y <= base; y++) {
        for (let x = tx - 2; x <= tx + 2; x++) {
          expect([Tile.Wood, Tile.Leaves]).not.toContain(world.getTile(x, y));
        }
      }
    }
    expect(trees).toBe(25);
  });
});
