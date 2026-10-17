import { describe, expect, it } from 'vitest';
import { MAP_PIN_MAX, MAP_PIN_NAME_MAX, ORE_COPPER, ORE_GOLD, QUICK_TORCH_RADIUS, TILE_SIZE } from '../src/config';
import { Player } from '../src/entities/player';
import { quickTorchSpot } from '../src/systems/building';
import type { Chest } from '../src/systems/chests';
import { RECIPES } from '../src/systems/crafting';
import { Health } from '../src/systems/health';
import { goalStatus, nextPickaxe, pickaxeNote, recipeFor, restorePinnedRecipe, whereFound } from '../src/systems/goal';
import { Inventory } from '../src/systems/inventory';
import { cleanPinName, MapPins } from '../src/systems/mapPins';
import { createSave, savedState } from '../src/systems/save';
import { ExploredMap } from '../src/world/explored';
import { Tile } from '../src/world/tiles';
import { World } from '../src/world/world';

const DT = 1 / 60;
const FLOOR = 30;
const PX = 20;

/** 60 x 40 world: stone floor from row FLOOR down, player standing on it at column PX. */
function setup(): { world: World; player: Player } {
  const world = new World(60, 40, 0);
  for (let ty = FLOOR; ty < 40; ty++) for (let tx = 0; tx < 60; tx++) world.setTile(tx, ty, Tile.Stone);
  const player = new Player(PX, FLOOR - 1);
  for (let i = 0; i < 2; i++) player.update(DT, world, { move: 0, jumpPressed: false, jumpHeld: false });
  return { world, player };
}

/** An explored map with everything seen. */
function allSeen(world: World): ExploredMap {
  const explored = new ExploredMap(world);
  explored.revealAll();
  return explored;
}

describe('map pins', () => {
  it('can only go on explored tiles', () => {
    const world = new World(100, 80, 0);
    const explored = new ExploredMap(world);
    const pins = new MapPins();
    expect(pins.add(10, 10, explored)).toBe('unexplored');
    explored.mark(10, 10);
    expect(pins.add(10, 10, explored)).toBe(0);
    expect(pins.pins).toEqual([{ tx: 10, ty: 10, name: 'Pin 1' }]);
  });

  it('are named "Pin N" with the lowest free N, and the first one is tracked', () => {
    const world = new World(100, 80, 0);
    const explored = allSeen(world);
    const pins = new MapPins();
    pins.add(1, 1, explored);
    pins.add(2, 2, explored);
    pins.add(3, 3, explored);
    expect(pins.tracked).toBe(0);
    pins.remove(1);
    pins.add(4, 4, explored);
    expect(pins.pins.map((p) => p.name)).toEqual(['Pin 1', 'Pin 3', 'Pin 2']);
    expect(pins.tracked).toBe(0); // adding while one is tracked doesn't move tracking
  });

  it(`stop at ${MAP_PIN_MAX}`, () => {
    const world = new World(100, 80, 0);
    const explored = allSeen(world);
    const pins = new MapPins();
    for (let i = 0; i < MAP_PIN_MAX; i++) expect(pins.add(i, 5, explored)).toBe(i);
    expect(pins.add(50, 5, explored)).toBe('full');
    expect(pins.pins.length).toBe(MAP_PIN_MAX);
  });

  it('keep tracking the same pin when another is removed, and drop it when it is', () => {
    const world = new World(100, 80, 0);
    const explored = allSeen(world);
    const pins = new MapPins();
    for (let i = 0; i < 3; i++) pins.add(i, 5, explored);
    pins.setTracked(2, true);
    pins.remove(0);
    expect(pins.trackedPin?.tx).toBe(2);
    pins.remove(1);
    expect(pins.tracked).toBeNull();
    // Tracking one pin untracks the other; untracking a pin that isn't tracked changes nothing.
    pins.add(7, 7, explored);
    pins.setTracked(1, true);
    pins.setTracked(0, false);
    expect(pins.tracked).toBe(1);
    pins.setTracked(1, false);
    expect(pins.tracked).toBeNull();
  });

  it('tidy names, and an empty name keeps the old one', () => {
    expect(cleanPinName('  Iron   vein  ')).toBe('Iron vein');
    expect(cleanPinName('x'.repeat(40)).length).toBe(MAP_PIN_NAME_MAX);
    const world = new World(100, 80, 0);
    const pins = new MapPins();
    pins.add(1, 1, allSeen(world));
    pins.rename(0, '   ');
    expect(pins.pins[0].name).toBe('Pin 1');
    pins.rename(0, ' Way down ');
    expect(pins.pins[0].name).toBe('Way down');
  });

  it('load from a save, skipping broken pins and keeping the tracked one', () => {
    const world = new World(100, 80, 0);
    const pins = MapPins.fromSave(
      {
        pins: [{ tx: 1, ty: 1, name: 'A' }, { tx: -5, ty: 1, name: 'Outside' }, { tx: 2.5, ty: 1, name: 'Half' }, null, { tx: 3, ty: 4, name: '  ' }],
        tracked: 4,
      },
      world,
    );
    expect(pins.pins).toEqual([
      { tx: 1, ty: 1, name: 'A' },
      { tx: 3, ty: 4, name: 'Pin 1' },
    ]);
    expect(pins.tracked).toBe(1);
    expect(MapPins.fromSave(undefined, world).pins).toEqual([]);
    expect(MapPins.fromSave({ pins: 'nope' }, world).pins).toEqual([]);
  });
});

describe('next goal', () => {
  it('says where ores are found, from the generation depths', () => {
    expect(whereFound('copper_ore')).toBe(`${ORE_COPPER.minDepth}–${ORE_COPPER.maxDepth} m down`);
    expect(whereFound('gold_ore')).toBe(`from ${ORE_GOLD.minDepth} m down`); // its band runs past the bottom of the world
    expect(whereFound('stone')).toBe('under the dirt');
    expect(whereFound('copper_bar')).toBeNull(); // made, not found
  });

  it('suggests the next pickaxe up and where its ore is', () => {
    expect(nextPickaxe(0)?.recipe.output).toBe('stone_pickaxe');
    expect(nextPickaxe(0)?.ore).toBeNull();
    expect(pickaxeNote(nextPickaxe(0)!)).toBe('Stone: under the dirt');
    const copper = nextPickaxe(1)!;
    expect(copper.recipe.output).toBe('copper_pickaxe');
    expect(copper.material).toBe('copper_bar');
    expect(copper.ore).toBe('copper_ore');
    expect(pickaxeNote(copper)).toBe(`Copper ore: ${ORE_COPPER.minDepth}–${ORE_COPPER.maxDepth} m down, smelted at a furnace`);
    expect(nextPickaxe(-1)?.recipe.output).toBe('stone_pickaxe'); // there's no wooden pickaxe recipe
    expect(nextPickaxe(4)).toBeNull(); // gold is the best
  });

  it('counts what is carried and what is in nearby chests, and checks the station', () => {
    const recipe = recipeFor('copper_pickaxe')!;
    const inventory = new Inventory();
    inventory.add('copper_bar', 4);
    inventory.add('wood', 9);
    const chest: Chest = { kind: 'chest', slots: [{ item: 'copper_bar', count: 3 }, null] };
    const status = goalStatus(recipe, inventory, new Set(), [chest]);
    expect(status.ingredients).toEqual([
      { item: 'copper_bar', need: 10, have: 7, where: null },
      { item: 'wood', need: 5, have: 9, where: 'from trees' },
    ]);
    expect(status.stationNear).toBe(false);
    expect(status.ready).toBe(false);
    chest.slots[1] = { item: 'copper_bar', count: 3 };
    expect(goalStatus(recipe, inventory, new Set(['workbench']), [chest]).ready).toBe(true);
  });

  it('loads a pinned recipe only if it is a recipe this version has', () => {
    expect(restorePinnedRecipe('torch')).toBe('torch');
    expect(restorePinnedRecipe('dirt')).toBeNull(); // an item, but nothing crafts it
    expect(restorePinnedRecipe('unobtainium')).toBeNull();
    expect(restorePinnedRecipe(undefined)).toBeNull();
    for (const recipe of RECIPES) expect(restorePinnedRecipe(recipe.output)).toBe(recipe.output);
  });
});

describe('quick torch', () => {
  it('uses the cursor spot when a torch can go there', () => {
    const { world, player } = setup();
    expect(quickTorchSpot(world, player, PX + 2, FLOOR - 1)).toEqual([PX + 2, FLOOR - 1]);
  });

  it("falls back to the spot nearest the player when the cursor can't take one", () => {
    const { world, player } = setup();
    const expected = quickTorchSpot(world, player, PX, FLOOR - 1); // the player's own feet tile
    // Cursor on solid rock, out of reach, or in mid-air with nothing to hang on.
    for (const [tx, ty] of [
      [PX + 1, FLOOR + 1],
      [PX + 30, FLOOR - 1],
      [PX + 2, FLOOR - 4],
    ]) {
      const spot = quickTorchSpot(world, player, tx, ty)!;
      expect(spot).not.toBeNull();
      expect(spot).toEqual(expected);
      expect(Math.abs(spot[0] - Math.floor(player.centerX / TILE_SIZE))).toBeLessThanOrEqual(QUICK_TORCH_RADIUS);
      expect(world.getTile(spot[0], spot[1])).toBe(Tile.Air);
      expect(world.getTile(spot[0], spot[1] + 1)).toBe(Tile.Stone); // standing on the floor
    }
  });

  it('finds nowhere in open air', () => {
    const world = new World(60, 40, 0);
    const player = new Player(PX, 10);
    expect(quickTorchSpot(world, player, PX, 12)).toBeNull();
  });
});

describe('saving guidance', () => {
  it('saves the pinned recipe and map pins through savedState', () => {
    const world = new World(100, 80, 0);
    const pins = new MapPins();
    pins.add(4, 5, allSeen(world));
    pins.rename(0, 'Iron vein');
    const player = new Player(0, 0);
    const inventory = new Inventory();
    const survival = { health: new Health(10), difficulty: 'normal' as const, bed: null, satchels: [], pinnedRecipe: 'iron_pickaxe' as const, mapPins: pins };
    const state = savedState(player, inventory, [], undefined, survival);
    expect(state.pinnedRecipe).toBe('iron_pickaxe');
    expect(state.mapPins).toEqual({ pins: [{ tx: 4, ty: 5, name: 'Iron vein' }], tracked: 0 });
    // The save is a copy: later changes don't leak into it.
    const save = structuredClone(createSave(world, player, inventory, [], undefined, { survival }));
    pins.rename(0, 'Changed');
    expect(MapPins.fromSave(save.mapPins, world).pins[0].name).toBe('Iron vein');
    expect(restorePinnedRecipe(save.pinnedRecipe)).toBe('iron_pickaxe');
  });
});
