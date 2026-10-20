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

  it("takes only its own leaves where its canopy touches a neighbour's", () => {
    // Trunks 4 apart: the canopies meet in column 12, which is as near one trunk as the other.
    const world = groundWorld();
    plantTree(world, 10, 5);
    plantTree(world, 14, 5);
    const neighbourLeaves = count(world, Tile.Leaves, 12, 16);
    world.setTile(10, GROUND - 1, Tile.Air);
    const felled = fellTreeAbove(world, 10, GROUND - 1);
    expect(count(world, Tile.Leaves, 8, 11)).toBe(0);
    expect(count(world, Tile.Leaves, 12, 16)).toBe(neighbourLeaves); // ties stay with the tree still standing
    expect(felled.filter((t) => t.tile === Tile.Leaves)).toHaveLength(11);
    // Felling the neighbour now takes all of its canopy, column 12 too.
    world.setTile(14, GROUND - 1, Tile.Air);
    fellTreeAbove(world, 14, GROUND - 1);
    expect(count(world, Tile.Leaves)).toBe(0);
  });

  it('splits overlapping canopies by which trunk is nearer, stumps included', () => {
    // Trunks 3 apart: column 11 is nearer the first, column 12 the second.
    const world = groundWorld();
    plantTree(world, 10, 5);
    plantTree(world, 13, 5);
    world.setTile(10, GROUND - 3, Tile.Air); // cut above a two-tile stump
    fellTreeAbove(world, 10, GROUND - 3);
    expect(count(world, Tile.Leaves, 8, 11)).toBe(0);
    expect(count(world, Tile.Leaves, 12, 15)).toBe(11);
    expect(count(world, Tile.Wood, 10, 10)).toBe(2);
    expect(count(world, Tile.Wood, 13, 13)).toBe(5);
  });

  it('leaves a neighbouring giant mushroom its cap', () => {
    const world = groundWorld();
    // Stems 5 apart, their 5-wide caps meeting at the edges.
    for (const x of [10, 15]) {
      for (let i = 1; i <= 4; i++) world.setTile(x, GROUND - i, Tile.MushroomStem);
      for (let dx = -2; dx <= 2; dx++) world.setTile(x + dx, GROUND - 5, Tile.MushroomCap);
      for (let dx = -1; dx <= 1; dx++) world.setTile(x + dx, GROUND - 6, Tile.MushroomCap);
    }
    world.setTile(10, GROUND - 1, Tile.Air);
    fellTreeAbove(world, 10, GROUND - 1, Tile.MushroomStem);
    expect(count(world, Tile.MushroomCap, 8, 12)).toBe(0);
    expect(count(world, Tile.MushroomCap, 13, 17)).toBe(8);
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
