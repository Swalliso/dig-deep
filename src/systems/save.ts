import { delMany, get, getMany, keys, set, setMany } from 'idb-keyval';
import { storageKey } from '../channel';
import { CHEST_SLOTS, CHUNK_SIZE, DROP_SIZE, HOTBAR_SIZE, TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../config';
import { ItemDrop } from '../entities/itemDrop';
import type { Player } from '../entities/player';
import { ExploredMap } from '../world/explored';
import { TileEntities } from '../world/tileEntities';
import { Tile, TILE_COUNT } from '../world/tiles';
import type { World } from '../world/world';
import { Inventory, type ItemStack, type Slots } from './inventory';
import { ITEMS, itemDef, type ItemId } from './items';

/**
 * Bump whenever the save format, the world size or world generation changes. (Adding an
 * optional field that old saves can do without, like `drops`, `tileEntities` or `explored`,
 * doesn't need a bump, and nor does a new tile id that doesn't renumber the others.)
 */
export const SAVE_VERSION = 1;
/**
 * The first world's save: 'dig-deep:save' on the live site (the dev site uses its own key; see
 * channel.ts). It's the key the game used before there were several worlds, so those saves
 * carry over as world 1.
 */
export const SAVE_KEY = storageKey('save');
export const FIRST_WORLD_ID = '1';

/** One world's save, as stored in IndexedDB. */
export interface SaveData {
  version: number;
  /** The world's name in the world list. Missing in older saves. */
  name?: string;
  seed: number;
  /** Date.now() when saved. */
  savedAt: number;
  /** Seconds of play in this world (the session clock). Missing in older saves. */
  playTime?: number;
  /** Only chunks changed since generation (the rest regenerate from the seed), RLE-compressed. */
  chunks: { index: number; data: Uint8Array }[];
  /** Player top-left in world px. */
  player: { x: number; y: number };
  inventory: { slots: (ItemStack | null)[]; selected: number };
  /**
   * Items lying on the ground (top-left in world px). A stack held on the mouse that didn't fit
   * in the inventory is saved here too, at the player. Missing in older saves.
   */
  drops?: SavedDrop[];
  /** Per-tile data such as chest contents. Missing in older saves. */
  tileEntities?: SavedTileEntity[];
  /** Tiles seen so far (the map), per chunk: 1 byte per tile, RLE-compressed. Missing in older saves. */
  explored?: { index: number; data: Uint8Array }[];
}

/**
 * A world in the world list. Each one is stored next to its save (and written with it), so the
 * title screen can list the worlds without loading every save.
 */
export interface WorldMeta {
  id: string;
  name: string;
  seed: number;
  /** Date.now() when last saved. */
  savedAt: number;
  /** The save's SAVE_VERSION; a world from another version can't be loaded. */
  version: number;
}

/** A tile entity and where it is. Only chests so far. */
export interface SavedTileEntity {
  tx: number;
  ty: number;
  kind: 'chest';
  slots: (ItemStack | null)[];
}

export interface SavedDrop {
  item: ItemId;
  count: number;
  x: number;
  y: number;
}

export type SaveStatus =
  | { kind: 'none' }
  | { kind: 'ok'; save: SaveData }
  | { kind: 'outdated'; version: number }
  | { kind: 'broken' };

// --- Run-length encoding: pairs of [run length 1..255, tile id]. ---

export function encodeRle(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; ) {
    const value = data[i];
    let run = 1;
    while (i + run < data.length && data[i + run] === value && run < 255) run++;
    out.push(run, value);
    i += run;
  }
  return Uint8Array.from(out);
}

/** Decode RLE data that must expand to exactly `length` bytes. */
export function decodeRle(rle: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i + 1 < rle.length; i += 2) {
    const run = rle[i];
    if (run === 0 || o + run > length) throw new Error('Corrupt chunk data');
    out.fill(rle[i + 1], o, o + run);
    o += run;
  }
  if (o !== length) throw new Error('Corrupt chunk data');
  return out;
}

// --- Building and applying saves (pure, so they can be unit-tested). ---

export function createSave(
  world: World,
  player: Player,
  inventory: Inventory,
  drops: readonly ItemDrop[],
  entities?: TileEntities,
  extra: { explored?: ExploredMap; name?: string; playTime?: number } = {},
): SaveData {
  return {
    version: SAVE_VERSION,
    name: extra.name,
    seed: world.seed,
    savedAt: Date.now(),
    playTime: extra.playTime ?? 0,
    chunks: [...world.changedChunks]
      .sort((a, b) => a - b)
      .map((index) => ({ index, data: encodeRle(world.chunks[index]) })),
    ...savedState(player, inventory, drops, entities),
    explored: extra.explored
      ? [...extra.explored.chunks.entries()].sort(([a], [b]) => a - b).map(([index, data]) => ({ index, data: encodeRle(data) }))
      : [],
  };
}

/**
 * The part of a save that isn't tiles, the map, the play time or the save's own details. It's
 * cheap to build, so autosave compares it (with the world's and the map's revision numbers) to
 * tell whether there's anything new to save. Saved state belongs here, so its changes are
 * always noticed; a test checks createSave adds nothing else.
 */
export type SavedState = Pick<SaveData, 'player' | 'inventory' | 'drops' | 'tileEntities'>;

export function savedState(player: Player, inventory: Inventory, drops: readonly ItemDrop[], entities?: TileEntities): SavedState {
  const { slots, overflow } = savedSlots(inventory);
  const saved: SavedDrop[] = drops.map((d) => ({ item: d.item, count: d.count, x: d.x, y: d.y }));
  // The rest of a stack held on the mouse that didn't fit in the inventory: saved lying at the
  // player, so saving never loses it.
  if (overflow) saved.push({ ...overflow, x: player.centerX - DROP_SIZE / 2, y: player.centerY - DROP_SIZE / 2 });
  return {
    player: { x: player.x, y: player.y },
    inventory: { slots, selected: inventory.selected },
    drops: saved,
    tileEntities: entities ? savedTileEntities(entities) : [],
  };
}

/** Tile entities as saved (copies, so later changes don't leak into a save waiting to be written). */
export function savedTileEntities(entities: TileEntities): SavedTileEntity[] {
  return entities.entries().map(({ tx, ty, entity }) => ({ tx, ty, kind: entity.kind, slots: entity.slots.map((s) => s && { ...s }) }));
}

/**
 * The inventory as saved, with anything held on the mouse put away as if the panel had been
 * closed. `overflow` is what of the held stack didn't fit, or null. The live inventory is untouched.
 */
function savedSlots(inventory: Inventory): { slots: (ItemStack | null)[]; overflow: ItemStack | null } {
  const copy = new Inventory();
  inventory.slots.forEach((s, i) => (copy.slots[i] = s && { ...s }));
  const held = inventory.cursor;
  const left = held ? copy.add(held.item, held.count) : 0;
  return { slots: copy.slots, overflow: held && left > 0 ? { item: held.item, count: left } : null };
}

/** Put the saved chunks back into a world freshly generated from the save's seed. */
export function applySavedChunks(world: World, save: SaveData): void {
  for (const { index, data } of save.chunks) {
    if (!Number.isInteger(index) || index < 0 || index >= world.chunks.length) continue;
    world.chunks[index].set(decodeRle(data, CHUNK_SIZE * CHUNK_SIZE));
    world.chunkVersions[index]++;
    world.changedChunks.add(index);
  }
}

/**
 * Saved slots copied into `slots`, skipping items that no longer exist and impossible counts.
 * Extra saved slots are ignored.
 */
function restoreSlots(saved: readonly unknown[], slots: Slots): void {
  saved.forEach((raw, i) => {
    const s = raw as ItemStack | null;
    if (i >= slots.length || !s || !(s.item in ITEMS) || !(s.count > 0)) return;
    slots[i] = { item: s.item, count: Math.min(Math.floor(s.count), itemDef(s.item as ItemId).maxStack) };
  });
}

/** Seconds played in the world, or 0 for a save from before play time was saved. */
export function restorePlayTime(save: SaveData): number {
  const time = save.playTime;
  return typeof time === 'number' && Number.isFinite(time) && time > 0 ? time : 0;
}

/** Rebuild the inventory, skipping anything that no longer exists. */
export function restoreInventory(save: SaveData): Inventory {
  const inventory = new Inventory();
  restoreSlots(save.inventory.slots, inventory.slots);
  const selected = save.inventory.selected;
  inventory.selected = Number.isInteger(selected) && selected >= 0 && selected < HOTBAR_SIZE ? selected : 0;
  return inventory;
}

/** Put the saved ground items back, at rest. Anything unrecognisable is skipped. */
export function restoreDrops(save: SaveData, world: World): ItemDrop[] {
  const maxX = world.width * TILE_SIZE - DROP_SIZE;
  const maxY = world.height * TILE_SIZE - DROP_SIZE;
  return (save.drops ?? [])
    .filter(
      (d) =>
        d &&
        d.item in ITEMS &&
        Number.isInteger(d.count) &&
        d.count > 0 &&
        Number.isFinite(d.x) &&
        Number.isFinite(d.y),
    )
    .map((d) => {
      const x = Math.min(Math.max(d.x, 0), maxX);
      const y = Math.min(Math.max(d.y, 0), maxY);
      const drop = new ItemDrop(d.item, d.count, x + DROP_SIZE / 2, y + DROP_SIZE / 2);
      drop.vx = 0;
      drop.vy = 0;
      return drop;
    });
}

/**
 * Tile entities for a world that already has its saved chunks applied. Entries that are
 * unrecognisable, or whose tile isn't a chest any more, are skipped.
 */
export function restoreTileEntities(save: SaveData, world: World): TileEntities {
  const entities = new TileEntities(world);
  for (const e of save.tileEntities ?? []) {
    if (!e || e.kind !== 'chest' || !Number.isInteger(e.tx) || !Number.isInteger(e.ty) || !Array.isArray(e.slots)) continue;
    if (!world.inBounds(e.tx, e.ty) || world.getTile(e.tx, e.ty) !== Tile.Chest) continue;
    const slots: Slots = new Array(CHEST_SLOTS).fill(null);
    restoreSlots(e.slots, slots);
    entities.set(e.tx, e.ty, { kind: 'chest', slots });
  }
  return entities;
}

/** The map's explored tiles from a save. Chunks that are out of range or unreadable are skipped. */
export function restoreExplored(save: SaveData, world: World): ExploredMap {
  const explored = new ExploredMap(world);
  for (const chunk of save.explored ?? []) {
    if (!chunk || !Number.isInteger(chunk.index) || chunk.index < 0 || chunk.index >= world.chunks.length) continue;
    if (!(chunk.data instanceof Uint8Array)) continue;
    try {
      explored.chunks.set(chunk.index, decodeRle(chunk.data, CHUNK_SIZE * CHUNK_SIZE).map((v) => (v ? 1 : 0)));
    } catch {
      // A corrupt chunk: those tiles just aren't explored.
    }
  }
  return explored;
}

/** Classify whatever came out of storage. */
export function checkSave(raw: unknown): SaveStatus {
  if (raw === undefined || raw === null) return { kind: 'none' };
  if (typeof raw !== 'object') return { kind: 'broken' };
  const save = raw as Partial<SaveData>;
  if (save.version !== SAVE_VERSION) {
    return typeof save.version === 'number' ? { kind: 'outdated', version: save.version } : { kind: 'broken' };
  }
  const valid =
    typeof save.seed === 'number' &&
    Array.isArray(save.chunks) &&
    save.chunks.every((c) => c && typeof c.index === 'number' && c.data instanceof Uint8Array) &&
    typeof save.player?.x === 'number' &&
    typeof save.player?.y === 'number' &&
    Array.isArray(save.inventory?.slots) &&
    (save.drops === undefined || Array.isArray(save.drops)) &&
    (save.tileEntities === undefined || Array.isArray(save.tileEntities)) &&
    (save.explored === undefined || Array.isArray(save.explored));
  return valid ? { kind: 'ok', save: save as SaveData } : { kind: 'broken' };
}

/**
 * Look through a save that passed checkSave for anything that would stop it loading: damaged
 * tile or map data, chunks outside the world or listed twice, unknown tiles, or a seed or player
 * position that isn't a number. Returns what's wrong, or null if nothing is. Backups are checked
 * with this before they're imported. (Unknown items and the like are just skipped on load.)
 */
export function findSaveProblem(save: SaveData): string | null {
  if (!Number.isSafeInteger(save.seed)) return 'its seed is not a whole number';
  if (!Number.isFinite(save.player.x) || !Number.isFinite(save.player.y)) return 'the player position is not a number';
  const chunkCount = Math.ceil(WORLD_WIDTH / CHUNK_SIZE) * Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);
  const layers: [string, { index: number; data: Uint8Array }[]][] = [
    ['tile', save.chunks],
    ['map', save.explored ?? []],
  ];
  for (const [what, chunks] of layers) {
    const seen = new Set<number>();
    for (const chunk of chunks) {
      if (!chunk || !(chunk.data instanceof Uint8Array)) return `some ${what} data is missing`;
      if (!Number.isInteger(chunk.index) || chunk.index < 0 || chunk.index >= chunkCount || seen.has(chunk.index)) {
        return `some ${what} data is outside the world`;
      }
      seen.add(chunk.index);
      let data: Uint8Array;
      try {
        data = decodeRle(chunk.data, CHUNK_SIZE * CHUNK_SIZE);
      } catch {
        return `some ${what} data is damaged`;
      }
      if (what === 'tile' && data.some((id) => id >= TILE_COUNT)) return 'it has tiles this version does not know';
    }
  }
  return null;
}

// --- World slots ---

/** Where world `id`'s save is stored. World 1 keeps the key from before there were several worlds. */
export function saveKeyFor(id: string): string {
  return id === FIRST_WORLD_ID ? SAVE_KEY : storageKey(`save:${id}`);
}

/** Where world `id`'s world-list entry is stored. */
export function metaKeyFor(id: string): string {
  return storageKey(`world:${id}`);
}

/** An unused world id: one more than the highest so far ('1' for the first world). */
export function nextWorldId(ids: readonly string[]): string {
  const highest = ids.reduce((max, id) => Math.max(max, Number.parseInt(id, 10) || 0), 0);
  return String(highest + 1);
}

/** The world-list entry for a save (or for whatever was stored where a save should be). */
export function metaFromSave(id: string, save: Partial<SaveData> | undefined): WorldMeta {
  const name = typeof save?.name === 'string' && save.name.trim() ? save.name.trim() : `World ${id}`;
  return {
    id,
    name,
    seed: typeof save?.seed === 'number' ? save.seed : 0,
    savedAt: typeof save?.savedAt === 'number' ? save.savedAt : 0,
    version: typeof save?.version === 'number' ? save.version : -1,
  };
}

function isWorldMeta(raw: unknown): raw is WorldMeta {
  const m = raw as Partial<WorldMeta> | undefined;
  return (
    !!m &&
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.seed === 'number' &&
    typeof m.savedAt === 'number' &&
    typeof m.version === 'number'
  );
}

// --- IndexedDB storage ---

/**
 * Every world, most recently saved first. A save from before world slots (world 1, with no
 * world-list entry yet) gets its entry here.
 */
export async function listWorlds(): Promise<WorldMeta[]> {
  try {
    const all = await keys();
    const prefix = metaKeyFor('');
    const metaKeys = all.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix));
    const worlds = (await getMany(metaKeys)).filter(isWorldMeta);
    if (all.includes(SAVE_KEY) && !worlds.some((w) => w.id === FIRST_WORLD_ID)) {
      const meta = metaFromSave(FIRST_WORLD_ID, await get(SAVE_KEY));
      await set(metaKeyFor(FIRST_WORLD_ID), meta);
      worlds.push(meta);
    }
    return worlds.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function readWorld(id: string): Promise<SaveStatus> {
  try {
    return checkSave(await get(saveKeyFor(id)));
  } catch {
    return { kind: 'broken' };
  }
}

/** Write world `id`'s save and its world-list entry together. */
export async function writeWorld(id: string, save: SaveData): Promise<void> {
  await setMany([
    [saveKeyFor(id), save],
    [metaKeyFor(id), metaFromSave(id, save)],
  ]);
}

export async function deleteWorld(id: string): Promise<void> {
  await delMany([saveKeyFor(id), metaKeyFor(id)]);
}

/** Debug helper: rewrite a stored world with an older version number. */
export async function markWorldOutdated(id: string): Promise<void> {
  const raw = await get(saveKeyFor(id));
  if (raw && typeof raw === 'object') await writeWorld(id, { ...raw, version: SAVE_VERSION - 1 });
}
