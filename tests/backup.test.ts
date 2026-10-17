import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../src/config';
import { ItemDrop } from '../src/entities/itemDrop';
import { Player } from '../src/entities/player';
import { chestAt } from '../src/systems/chests';
import { Inventory } from '../src/systems/inventory';
import { backupFileName, backupText, base64ToBytes, bytesToBase64, readBackup } from '../src/systems/backup';
import {
  applySavedChunks,
  createSave,
  encodeRle,
  restoreDrops,
  restoreExplored,
  restoreInventory,
  restorePlayTime,
  restoreTileEntities,
  SAVE_VERSION,
  type SaveData,
} from '../src/systems/save';
import { generateWorld } from '../src/world/generate';
import { ExploredMap } from '../src/world/explored';
import { TileEntities } from '../src/world/tileEntities';
import { Tile } from '../src/world/tiles';

/**
 * A played world: dug and built tiles, a chest with things in it, items on the ground, part of
 * the map explored, a full inventory with more held on the mouse, and some play time.
 */
function playedSave(): { save: SaveData; total: (item: string) => number } {
  const world = generateWorld(42);
  const { spawnTx: sx, spawnTy: sy } = world;
  for (let y = sy + 1; y < sy + 40; y++) world.setTile(sx + 3, y, Tile.Air);
  world.setTile(sx - 2, sy, Tile.Torch);
  const entities = new TileEntities(world);
  world.setTile(sx + 1, sy, Tile.Chest);
  const chest = chestAt(world, entities, sx + 1, sy)!;
  chest.slots[0] = { item: 'iron_bar', count: 7 };
  chest.slots[19] = { item: 'gold_pickaxe', count: 1 };
  const explored = new ExploredMap(world);
  for (let ty = sy - 20; ty < sy + 20; ty++) for (let tx = sx - 30; tx < sx + 30; tx++) explored.mark(tx, ty);
  const player = new Player(sx, sy);
  const inventory = Inventory.withStartingItems();
  for (let i = 0; i < 40; i++) inventory.add('stone', 99);
  inventory.cursor = { item: 'coal', count: 12 }; // no room left for it
  const drops = [new ItemDrop('copper_ore', 3, (sx + 5) * 16, sy * 16)];
  const save = createSave(world, player, inventory, drops, entities, { explored, name: 'Backup test', playTime: 754.5 });
  const total = (item: string): number => {
    const reloaded = generateWorld(save.seed);
    applySavedChunks(reloaded, save);
    return (
      restoreInventory(save).count(item as never) +
      restoreDrops(save, reloaded).reduce((n, d) => (d.item === item ? n + d.count : n), 0)
    );
  };
  return { save, total };
}

describe('world backups', () => {
  it('round-trip a played world: tiles, items, chests, the map and play time', () => {
    const { save } = playedSave();
    const text = backupText(save);
    const read = readBackup(text);
    expect(read.kind).toBe('ok');
    const restored = (read as { save: SaveData }).save;
    // Exactly what IndexedDB would have stored, typed arrays included.
    expect(restored).toEqual(save);
    expect(restored.chunks[0].data).toBeInstanceOf(Uint8Array);

    const world = generateWorld(42);
    applySavedChunks(world, save);
    const reloaded = generateWorld(restored.seed);
    applySavedChunks(reloaded, restored);
    expect(reloaded.hash()).toBe(world.hash());
    expect(restoreInventory(restored).slots).toEqual(restoreInventory(save).slots);
    expect(restoreDrops(restored, reloaded).map((d) => [d.item, d.count, d.x, d.y])).toEqual(
      restoreDrops(save, world).map((d) => [d.item, d.count, d.x, d.y]),
    );
    const chests = restoreTileEntities(restored, reloaded);
    expect(chests.size).toBe(1);
    expect(chests.entries()[0].entity.slots).toEqual(save.tileEntities![0].slots);
    const map = restoreExplored(restored, reloaded);
    expect([...map.chunks.keys()]).toEqual([...restoreExplored(save, world).chunks.keys()]);
    expect(map.isExplored(reloaded.spawnTx, reloaded.spawnTy)).toBe(true);
    expect(restorePlayTime(restored)).toBe(754.5);
  });

  it('keep every item, including what was held on the mouse with a full inventory', () => {
    const { save, total } = playedSave();
    const restored = (readBackup(backupText(save)) as { save: SaveData }).save;
    expect(total('coal')).toBe(12);
    const reloaded = generateWorld(restored.seed);
    applySavedChunks(reloaded, restored);
    const coal = restoreInventory(restored).count('coal') + restoreDrops(restored, reloaded).filter((d) => d.item === 'coal').reduce((n, d) => n + d.count, 0);
    expect(coal).toBe(12);
  });

  it('are plain JSON, with binary data as base64', () => {
    const { save } = playedSave();
    const file = JSON.parse(backupText(save));
    expect(file).toMatchObject({ game: 'dig-deep', kind: 'world', backupVersion: 1, save: { version: SAVE_VERSION, seed: 42 } });
    expect(typeof file.save.chunks[0].data.$bytes).toBe('string');
    expect(base64ToBytes(file.save.chunks[0].data.$bytes)).toEqual(save.chunks[0].data);
  });

  it('encode long byte arrays to base64 and back', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7919) & 0xff);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(bytesToBase64(new Uint8Array())).toBe('');
  });

  it('trim a long or blank world name', () => {
    const { save } = playedSave();
    const long = readBackup(backupText({ ...save, name: `  ${'x'.repeat(60)}  ` }));
    expect((long as { save: SaveData }).save.name).toBe('x'.repeat(40));
    const blank = readBackup(backupText({ ...save, name: '   ' }));
    expect((blank as { save: SaveData }).save.name).toBeUndefined();
  });

  it('name the file after the world and the day', () => {
    expect(backupFileName('My World: Deep!', new Date(2026, 9, 6))).toBe('dig-deep-my-world-deep-2026-10-06.json');
    expect(backupFileName('???', new Date(2026, 0, 1))).toBe('dig-deep-world-2026-01-01.json');
  });
});

describe('importing a backup', () => {
  const valid = (): SaveData => playedSave().save;
  /** The backup's JSON with something changed. */
  const edited = (change: (file: { backupVersion: number; save: Record<string, unknown> }) => void): string => {
    const file = JSON.parse(backupText(valid()));
    change(file);
    return JSON.stringify(file);
  };
  const reason = (text: string): string => {
    const read = readBackup(text);
    expect(read.kind).toBe('invalid');
    return (read as { reason: string }).reason;
  };

  it('rejects files that are not world backups', () => {
    expect(reason('not json at all')).toMatch(/isn't a Dig Deep world backup/);
    expect(reason('{"hello": 1}')).toMatch(/isn't a Dig Deep world backup/);
    expect(reason('null')).toMatch(/isn't a Dig Deep world backup/);
    expect(reason(JSON.stringify({ game: 'dig-deep', kind: 'world', backupVersion: 1 }))).toMatch(/isn't a Dig Deep world backup/);
    expect(reason(edited((f) => (f.backupVersion = 99)))).toMatch(/another version/);
  });

  it('rejects worlds saved by another version of the game', () => {
    expect(reason(edited((f) => (f.save.version = SAVE_VERSION - 1)))).toMatch(/older version/);
    expect(reason(edited((f) => (f.save.version = SAVE_VERSION + 1)))).toMatch(/newer version/);
  });

  it('rejects damaged data instead of importing it', () => {
    const chunk = (f: { save: Record<string, unknown> }) => (f.save.chunks as { index: number; data: { $bytes: string } }[])[0];
    expect(reason(edited((f) => (chunk(f).data.$bytes = '!!not base64!!')))).toMatch(/isn't a Dig Deep world backup/);
    expect(reason(edited((f) => (chunk(f).data.$bytes = bytesToBase64(Uint8Array.from([255, 1])))))).toMatch(/damaged \(some tile data is damaged\)/);
    expect(reason(edited((f) => (chunk(f).index = 99_999)))).toMatch(/outside the world/);
    expect(
      reason(edited((f) => (f.save.chunks as unknown[]).push((f.save.chunks as unknown[])[0]))),
    ).toMatch(/outside the world/); // the same chunk twice
    const unknownTiles = bytesToBase64(encodeRle(new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(250)));
    expect(reason(edited((f) => (chunk(f).data.$bytes = unknownTiles)))).toMatch(/tiles this version does not know/);
    expect(reason(edited((f) => (f.save.seed = 1.5)))).toMatch(/seed/);
    expect(reason(edited((f) => (f.save.player = { x: 'left', y: 0 })))).toMatch(/damaged/);
    expect(reason(edited((f) => delete f.save.inventory))).toMatch(/damaged/);
    const explored = (f: { save: Record<string, unknown> }) => (f.save.explored as { data: { $bytes: string } }[])[0];
    expect(reason(edited((f) => (explored(f).data.$bytes = bytesToBase64(Uint8Array.from([0, 1])))))).toMatch(/map data is damaged/);
  });
});
