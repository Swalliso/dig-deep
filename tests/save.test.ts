import { describe, expect, it } from 'vitest';
import { storageKey } from '../src/channel';
import { CHUNK_SIZE, MAX_STACK, TILE_SIZE } from '../src/config';
import { ItemDrop } from '../src/entities/itemDrop';
import { Player } from '../src/entities/player';
import { Inventory } from '../src/systems/inventory';
import {
  applySavedChunks,
  checkSave,
  createSave,
  decodeRle,
  encodeRle,
  restoreDrops,
  restoreInventory,
  SAVE_KEY,
  SAVE_VERSION,
  type SaveData,
} from '../src/systems/save';
import { createRng, randInt } from '../src/util/rng';
import { generateWorld } from '../src/world/generate';
import { Tile } from '../src/world/tiles';

const CHUNK_BYTES = CHUNK_SIZE * CHUNK_SIZE;

describe('run-length encoding', () => {
  it('round-trips chunk data exactly', () => {
    const rng = createRng(3);
    const samples = [
      new Uint8Array(CHUNK_BYTES), // all air
      new Uint8Array(CHUNK_BYTES).fill(Tile.Stone),
      Uint8Array.from({ length: CHUNK_BYTES }, () => randInt(rng, 0, 15)), // noise
      Uint8Array.from({ length: CHUNK_BYTES }, (_, i) => (i % 70 < 60 ? Tile.Stone : Tile.CoalOre)),
    ];
    for (const data of samples) expect(decodeRle(encodeRle(data), CHUNK_BYTES)).toEqual(data);
  });

  it('shrinks typical underground chunks a lot', () => {
    const world = generateWorld(42);
    const chunk = world.chunks[world.chunksX * 8 + 15]; // stone/caves around row 256
    expect(encodeRle(chunk).length).toBeLessThan(CHUNK_BYTES / 2);
  });

  it('rejects data that does not expand to a whole chunk', () => {
    expect(() => decodeRle(Uint8Array.from([255, 3]), CHUNK_BYTES)).toThrow();
    expect(() => decodeRle(Uint8Array.from([0, 3]), CHUNK_BYTES)).toThrow();
  });
});

describe('saving and loading', () => {
  /** A world with a dug hole and a built wall, a moved player and a used inventory. */
  function playedWorld() {
    const world = generateWorld(42);
    const player = new Player(world.spawnTx, world.spawnTy);
    for (let y = world.spawnTy + 1; y < world.spawnTy + 30; y++) world.setTile(world.spawnTx + 3, y, Tile.Air);
    for (let y = world.spawnTy - 4; y <= world.spawnTy; y++) world.setTile(world.spawnTx - 3, y, Tile.Dirt);
    world.setTile(world.spawnTx + 4, world.spawnTy + 10, Tile.Torch);
    player.placeAt(player.x + 40, player.y - 20);
    const inventory = Inventory.withStartingItems();
    inventory.add('dirt', 57);
    inventory.add('coal', 3);
    inventory.selected = 2;
    return { world, player, inventory };
  }

  it('stores only the chunks that changed since generation', () => {
    expect(generateWorld(42).changedChunks.size).toBe(0);
    const { world, player, inventory } = playedWorld();
    const save = createSave(world, player, inventory, []);
    expect(save.chunks.length).toBe(world.changedChunks.size);
    expect(save.chunks.length).toBeGreaterThan(0);
    expect(save.chunks.length).toBeLessThan(6);
  });

  it('brings back the world, the player and the inventory exactly', () => {
    const { world, player, inventory } = playedWorld();
    // structuredClone is what IndexedDB does to the object on the way in and out.
    const stored: unknown = structuredClone(createSave(world, player, inventory, []));
    const status = checkSave(stored);
    expect(status.kind).toBe('ok');
    const save = (status as { save: SaveData }).save;

    const reloaded = generateWorld(save.seed);
    applySavedChunks(reloaded, save);
    expect(reloaded.hash()).toBe(world.hash());
    expect(reloaded.getTile(world.spawnTx + 4, world.spawnTy + 10)).toBe(Tile.Torch);
    expect(save.player).toEqual({ x: player.x, y: player.y });

    const restored = restoreInventory(save);
    expect(restored.slots).toEqual(inventory.slots);
    expect(restored.selected).toBe(2);
  });

  it('keeps saving changed chunks after a reload', () => {
    const { world, player, inventory } = playedWorld();
    const save = createSave(world, player, inventory, []);
    const reloaded = generateWorld(save.seed);
    applySavedChunks(reloaded, save);
    expect(createSave(reloaded, player, inventory, []).chunks).toEqual(save.chunks);
  });

  it('puts a stack held on the mouse back into the saved inventory', () => {
    const inventory = Inventory.withStartingItems();
    inventory.clickSlot(1); // pick up the torches
    const save = createSave(generateWorld(1), new Player(0, 0), inventory, []);
    expect(restoreInventory(save).count('torch')).toBe(10);
    expect(inventory.cursor).not.toBeNull(); // the live inventory is untouched
  });

  it('skips unknown items and impossible counts when restoring', () => {
    const save = createSave(generateWorld(1), new Player(0, 0), new Inventory(), []);
    save.inventory.slots[0] = { item: 'unobtainium' as never, count: 5 };
    save.inventory.slots[1] = { item: 'dirt', count: 5000 };
    save.inventory.slots[2] = { item: 'stone', count: -2 };
    save.inventory.selected = 99;
    const restored = restoreInventory(save);
    expect(restored.slots[0]).toBeNull();
    expect(restored.slots[1]).toEqual({ item: 'dirt', count: MAX_STACK });
    expect(restored.slots[2]).toBeNull();
    expect(restored.selected).toBe(0);
  });
});

describe('items on the ground', () => {
  it('are saved and come back where they were, at rest', () => {
    const world = generateWorld(42);
    const drops = [
      new ItemDrop('coal', 3, 8010, 2000),
      new ItemDrop('iron_ore', 1, 7900, 2100),
      new ItemDrop('stone_pickaxe', 1, 8100, 1950),
    ];
    const stored = structuredClone(createSave(world, new Player(0, 0), new Inventory(), drops)) as SaveData;
    const restored = restoreDrops(stored, world);
    expect(restored.map((d) => [d.item, d.count, d.x, d.y, d.vx, d.vy])).toEqual(
      drops.map((d) => [d.item, d.count, d.x, d.y, 0, 0]),
    );
  });

  it('skips anything unrecognisable and keeps drops inside the world', () => {
    const world = generateWorld(1);
    const save = createSave(world, new Player(0, 0), new Inventory(), []);
    save.drops = [
      { item: 'unobtainium' as never, count: 1, x: 10, y: 10 },
      { item: 'coal', count: 0, x: 10, y: 10 },
      { item: 'coal', count: 2, x: Number.NaN, y: 10 },
      { item: 'coal', count: 2, x: -500, y: 1e9 },
    ];
    const restored = restoreDrops(save, world);
    expect(restored).toHaveLength(1);
    expect(restored[0].x).toBe(0);
    expect(restored[0].y).toBeLessThan(world.height * TILE_SIZE);
  });

  it('loads a save made before drops were saved, with no drops', () => {
    const world = generateWorld(1);
    const save = createSave(world, new Player(0, 0), new Inventory(), []);
    delete save.drops;
    expect(checkSave(save).kind).toBe('ok');
    expect(restoreDrops(save, world)).toEqual([]);
  });
});

describe('save checks', () => {
  const valid = () => createSave(generateWorld(1), new Player(0, 0), new Inventory(), []);

  it('reports an empty slot', () => {
    expect(checkSave(undefined)).toEqual({ kind: 'none' });
  });

  it('flags a save from another version instead of loading it', () => {
    expect(checkSave({ ...valid(), version: SAVE_VERSION - 1 })).toEqual({ kind: 'outdated', version: SAVE_VERSION - 1 });
    expect(checkSave({ ...valid(), version: SAVE_VERSION + 1 }).kind).toBe('outdated');
  });

  it('flags data that is not a save', () => {
    expect(checkSave('hello').kind).toBe('broken');
    expect(checkSave({ version: SAVE_VERSION, seed: 1 }).kind).toBe('broken');
    expect(checkSave({ seed: 1 }).kind).toBe('broken');
  });

  it('accepts a real save', () => {
    expect(checkSave(valid()).kind).toBe('ok');
  });
});

describe('save key', () => {
  it('keeps the live key and gives the dev site its own', () => {
    // The live and dev sites share one origin; changing the live key would lose players' saves.
    expect(storageKey('save', 'live')).toBe('dig-deep:save');
    expect(storageKey('save', 'dev')).toBe('dig-deep-dev:save');
    expect(SAVE_KEY).toBe('dig-deep:save'); // tests build as the live channel
  });
});
