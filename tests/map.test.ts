import { describe, expect, it } from 'vitest';
import { EXPLORE_RADIUS } from '../src/config';
import { Player } from '../src/entities/player';
import { Inventory } from '../src/systems/inventory';
import { createSave, restoreExplored, type SaveData } from '../src/systems/save';
import { ExploredMap, type LightSource } from '../src/world/explored';
import { World } from '../src/world/world';

/** Lit to the left of column 5, dark everywhere else. */
const LEFT_LIT: LightSource = { level: (tx) => (tx < 5 ? 16 : 0) };

describe('explored map', () => {
  it('sees lit tiles on screen and everything near the player', () => {
    const world = new World(100, 80, 0);
    const explored = new ExploredMap(world);
    explored.look(LEFT_LIT, 0, 0, 9, 9, 50, 50);
    expect(explored.isExplored(2, 2)).toBe(true);
    expect(explored.isExplored(7, 7)).toBe(false); // on screen but dark
    expect(explored.isExplored(50 + EXPLORE_RADIUS, 50)).toBe(true); // dark, but next to the player
    expect(explored.isExplored(50 + EXPLORE_RADIUS + 1, 50)).toBe(false);
  });

  it('counts each tile once, so saving only sees real changes', () => {
    const world = new World(100, 80, 0);
    const explored = new ExploredMap(world);
    const seen: [number, number][] = [];
    explored.onExplore = (tx, ty) => seen.push([tx, ty]);
    expect(explored.mark(3, 4)).toBe(true);
    expect(explored.mark(3, 4)).toBe(false);
    expect(explored.revision).toBe(1);
    expect(seen).toEqual([[3, 4]]);
    expect(explored.mark(-1, 4)).toBe(false); // outside the world
  });

  it('only keeps chunks with something seen in them', () => {
    const world = new World(100, 80, 0);
    const explored = new ExploredMap(world);
    explored.mark(1, 1);
    explored.mark(40, 40);
    expect(explored.chunks.size).toBe(2);
    const visited: [number, number][] = [];
    explored.forEachExplored((tx, ty) => visited.push([tx, ty]));
    expect(visited.sort()).toEqual([
      [1, 1],
      [40, 40],
    ]);
  });

  it('round-trips through a save, skipping chunks that make no sense', () => {
    const world = new World(100, 80, 0);
    const explored = new ExploredMap(world);
    explored.look(LEFT_LIT, 0, 0, 30, 30, 70, 60);
    const stored = structuredClone(createSave(world, new Player(0, 0), new Inventory(), [], undefined, { explored })) as SaveData;
    stored.explored!.push({ index: 9999, data: new Uint8Array([4, 1]) }, { index: 1, data: new Uint8Array([7]) });
    const restored = restoreExplored(stored, world);
    for (let ty = 0; ty < world.height; ty++) {
      for (let tx = 0; tx < world.width; tx++) expect(restored.isExplored(tx, ty)).toBe(explored.isExplored(tx, ty));
    }
  });

  it('is empty for saves from before the map', () => {
    const world = new World(100, 80, 0);
    const save = createSave(world, new Player(0, 0), new Inventory(), []);
    delete save.explored;
    expect(restoreExplored(save, world).chunks.size).toBe(0);
  });
});
