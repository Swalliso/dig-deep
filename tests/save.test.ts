import { describe, expect, it } from 'vitest';
import { storageKey } from '../src/channel';
import { CHEST_SLOTS, CHUNK_SIZE, DROP_SIZE, MAX_STACK, TILE_SIZE } from '../src/config';
import { throwFlare } from '../src/entities/flare';
import { ItemDrop } from '../src/entities/itemDrop';
import { Player } from '../src/entities/player';
import { CaveIns } from '../src/systems/caveIns';
import { chestAt } from '../src/systems/chests';
import { Dread } from '../src/systems/dread';
import { Health } from '../src/systems/health';
import { Inventory, type ItemStack } from '../src/systems/inventory';
import {
  applySavedChunks,
  checkSave,
  createSave,
  decodeRle,
  encodeRle,
  findSaveProblem,
  FIRST_WORLD_ID,
  metaFromSave,
  metaKeyFor,
  nextWorldId,
  restoreDrops,
  restoreInventory,
  restorePlayTime,
  restoreTileEntities,
  SAVE_KEY,
  SAVE_VERSION,
  saveKeyFor,
  savedState,
  type SaveData,
  type SavedTileEntity,
} from '../src/systems/save';
import { createRng, randInt } from '../src/util/rng';
import { MapPins } from '../src/systems/mapPins';
import { ExploredMap } from '../src/world/explored';
import { generateWorld } from '../src/world/generate';
import { TileEntities, type TileEntity } from '../src/world/tileEntities';
import { Tile } from '../src/world/tiles';
import { TileUpdates } from '../src/world/tileUpdates';

const CHUNK_BYTES = CHUNK_SIZE * CHUNK_SIZE;

/** A chest's slots, from a tile entity (live or saved) that must be a chest. */
function chestSlots(entity: SavedTileEntity | TileEntity): (ItemStack | null)[] {
  if (entity.kind !== 'chest') throw new Error(`expected a chest, got ${entity.kind}`);
  return entity.slots;
}

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
    expect(save.player).toEqual({ x: player.x, y: player.y, fallTop: null });

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

describe('chests', () => {
  /** A world with two placed chests, one of them holding a few stacks. */
  function chestWorld() {
    const world = generateWorld(42);
    const entities = new TileEntities(world);
    const tx = world.spawnTx + 2;
    const ty = world.spawnTy;
    world.setTile(tx, ty, Tile.Chest);
    world.setTile(tx + 1, ty, Tile.Chest);
    const chest = chestAt(world, entities, tx, ty)!;
    chest.slots[0] = { item: 'iron_bar', count: 12 };
    chest.slots[7] = { item: 'torch', count: 40 };
    chest.slots[CHEST_SLOTS - 1] = { item: 'gold_pickaxe', count: 1 };
    chestAt(world, entities, tx + 1, ty);
    return { world, entities, tx, ty };
  }

  it('keep their contents through a save and reload', () => {
    const { world, entities, tx, ty } = chestWorld();
    const stored = structuredClone(createSave(world, new Player(0, 0), new Inventory(), [], entities)) as SaveData;
    expect(checkSave(stored).kind).toBe('ok');

    const reloaded = generateWorld(stored.seed);
    applySavedChunks(reloaded, stored);
    const restored = restoreTileEntities(stored, reloaded);
    expect(restored.size).toBe(2);
    expect(chestAt(reloaded, restored, tx, ty)!.slots).toEqual(chestAt(world, entities, tx, ty)!.slots);
    expect(chestAt(reloaded, restored, tx + 1, ty)!.slots.every((s) => s === null)).toBe(true);
  });

  it('are copied into the save, so later changes are not', () => {
    const { world, entities, tx, ty } = chestWorld();
    const save = createSave(world, new Player(0, 0), new Inventory(), [], entities);
    chestAt(world, entities, tx, ty)!.slots[0]!.count = 1;
    expect(chestSlots(save.tileEntities![0])[0]).toEqual({ item: 'iron_bar', count: 12 });
  });

  it('skip entries that are unrecognisable or no longer on a chest', () => {
    const { world, entities, tx, ty } = chestWorld();
    const save = createSave(world, new Player(0, 0), new Inventory(), [], entities);
    save.tileEntities!.push(
      { tx: tx + 5, ty, kind: 'chest', slots: [{ item: 'coal', count: 3 }] }, // no chest there
      { tx: -1, ty: 2, kind: 'chest', slots: [] },
      { tx: 1.5, ty, kind: 'chest', slots: [] },
      { tx, ty, kind: 'lift' as never, slots: [] },
      null as never,
    );
    chestSlots(save.tileEntities![0])[1] = { item: 'unobtainium' as never, count: 4 };
    chestSlots(save.tileEntities![0])[2] = { item: 'dirt', count: 5000 };
    const restored = restoreTileEntities(save, world);
    expect(restored.size).toBe(2);
    const chest = chestSlots(restored.get(tx, ty)!);
    expect(chest).toHaveLength(CHEST_SLOTS);
    expect(chest[1]).toBeNull();
    expect(chest[2]).toEqual({ item: 'dirt', count: MAX_STACK });
  });

  it('load from a save made before chests, as empty chests', () => {
    const world = generateWorld(1);
    const save = createSave(world, new Player(0, 0), new Inventory(), []);
    delete save.tileEntities;
    expect(checkSave(save).kind).toBe('ok');
    expect(restoreTileEntities(save, world).size).toBe(0);
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

describe('world slots', () => {
  it('keep world 1 on the old save key, so saves from before several worlds carry over', () => {
    expect(saveKeyFor(FIRST_WORLD_ID)).toBe('dig-deep:save');
    expect(saveKeyFor('2')).toBe('dig-deep:save:2');
    expect(metaKeyFor('2')).toBe('dig-deep:world:2');
  });

  it('give each new world the next unused id', () => {
    expect(nextWorldId([])).toBe('1');
    expect(nextWorldId(['1', '2'])).toBe('3');
    expect(nextWorldId(['3', '1'])).toBe('4');
  });

  it('list a world by its save, with fallbacks for older or unreadable saves', () => {
    const save = createSave(generateWorld(1), new Player(0, 0), new Inventory(), [], undefined, { name: 'Caves' });
    expect(metaFromSave('2', save)).toEqual({ id: '2', name: 'Caves', seed: 1, savedAt: save.savedAt, version: SAVE_VERSION });
    const unnamed = { ...save, name: undefined };
    expect(metaFromSave('1', unnamed).name).toBe('World 1');
    expect(metaFromSave('3', undefined)).toEqual({ id: '3', name: 'World 3', seed: 0, savedAt: 0, version: -1 });
  });
});

describe('save reliability', () => {
  /** An inventory with every slot full of stone. */
  function fullInventory(): Inventory {
    const inventory = new Inventory();
    for (let i = 0; i < inventory.slots.length; i++) inventory.add('stone', MAX_STACK);
    expect(inventory.canAdd('stone')).toBe(false);
    return inventory;
  }

  it('keeps a stack held on the mouse when the inventory is full, at the player', () => {
    const world = generateWorld(1);
    const player = new Player(world.spawnTx, world.spawnTy);
    const inventory = fullInventory();
    inventory.cursor = { item: 'torch', count: 9 };
    const save = structuredClone(createSave(world, player, inventory, [new ItemDrop('coal', 2, 100, 100)])) as SaveData;
    expect(restoreInventory(save).count('torch')).toBe(0);
    const drops = restoreDrops(save, world);
    expect(drops.map((d) => [d.item, d.count])).toEqual([
      ['coal', 2],
      ['torch', 9],
    ]);
    const torch = drops[1];
    expect(Math.abs(torch.x + DROP_SIZE / 2 - player.centerX)).toBeLessThan(1);
    expect(Math.abs(torch.y + DROP_SIZE / 2 - player.centerY)).toBeLessThan(1);
    expect(inventory.cursor).toEqual({ item: 'torch', count: 9 }); // the live game is untouched
  });

  it('puts away what fits of a held stack and keeps the rest', () => {
    const world = generateWorld(1);
    const inventory = fullInventory();
    inventory.slots[5] = { item: 'stone', count: MAX_STACK - 20 };
    inventory.cursor = { item: 'stone', count: 50 };
    const save = createSave(world, new Player(0, 0), inventory, []);
    expect(restoreInventory(save).count('stone')).toBe(inventory.slots.length * MAX_STACK);
    expect(save.drops).toEqual([expect.objectContaining({ item: 'stone', count: 30 })]);
  });

  it('notices every saved change: only tiles, the map, play time and save details are left out of savedState', () => {
    const world = generateWorld(1);
    const player = new Player(0, 0);
    const inventory = Inventory.withStartingItems();
    const caveIns = new CaveIns(world, new TileUpdates(world), true);
    const survival = {
      health: new Health(10),
      difficulty: 'normal' as const,
      bed: { tx: 3, ty: 4 },
      satchels: [{ x: 1, y: 2, stacks: [{ item: 'coal' as const, count: 3 }] }],
      caveIns,
      dread: new Dread(),
      flares: [throwFlare(10, 20, 100, 20)],
      pinnedRecipe: 'torch' as const,
      mapPins: new MapPins(),
      heartClaimedAt: 12.5,
    };
    const save = createSave(world, player, inventory, [], new TileEntities(world), { explored: new ExploredMap(world), playTime: 5, survival });
    const state = savedState(player, inventory, [], new TileEntities(world), survival);
    // Autosave compares savedState (plus the world's and map's revisions), so new saved state
    // must go through it to trigger the 2 s save.
    const rest = Object.keys(save).filter((key) => !(key in state));
    expect(rest.sort()).toEqual(['chunks', 'explored', 'name', 'playTime', 'profile', 'savedAt', 'seed', 'version']);
    for (const key of Object.keys(state)) expect(save[key as keyof SaveData]).toEqual(state[key as keyof typeof state]);
  });

  it('saves the session clock, and loads older saves at 0', () => {
    const world = generateWorld(1);
    const save = createSave(world, new Player(0, 0), new Inventory(), [], undefined, { playTime: 321.25 });
    expect(restorePlayTime(structuredClone(save))).toBe(321.25);
    expect(restorePlayTime({ ...save, playTime: undefined })).toBe(0);
    expect(restorePlayTime({ ...save, playTime: Number.NaN })).toBe(0);
    expect(restorePlayTime({ ...save, playTime: -4 })).toBe(0);
  });
});

describe('deep save checks', () => {
  const valid = () => {
    const world = generateWorld(1);
    world.setTile(world.spawnTx, world.spawnTy + 2, Tile.Air);
    return createSave(world, new Player(0, 0), new Inventory(), []);
  };

  it('find nothing wrong with a real save', () => {
    expect(findSaveProblem(valid())).toBeNull();
  });

  it('find damaged or impossible tile data', () => {
    const save = valid();
    expect(findSaveProblem({ ...save, chunks: [{ index: 3, data: Uint8Array.from([255, 1]) }] })).toMatch(/damaged/);
    expect(findSaveProblem({ ...save, chunks: [{ index: -1, data: save.chunks[0].data }] })).toMatch(/outside/);
    expect(findSaveProblem({ ...save, chunks: [save.chunks[0], save.chunks[0]] })).toMatch(/outside/);
    const unknown = encodeRle(new Uint8Array(CHUNK_BYTES).fill(200));
    expect(findSaveProblem({ ...save, chunks: [{ index: 0, data: unknown }] })).toMatch(/does not know/);
    expect(findSaveProblem({ ...save, seed: Number.POSITIVE_INFINITY })).toMatch(/seed/);
    expect(findSaveProblem({ ...save, player: { x: Number.NaN, y: 0 } })).toMatch(/player/);
  });
});
