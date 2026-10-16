import { del, get, set } from 'idb-keyval';
import { storageKey } from '../channel';
import { CHEST_SLOTS, CHUNK_SIZE, DROP_SIZE, HOTBAR_SIZE, TILE_SIZE } from '../config';
import { ItemDrop } from '../entities/itemDrop';
import type { Player } from '../entities/player';
import { TileEntities } from '../world/tileEntities';
import { Tile } from '../world/tiles';
import type { World } from '../world/world';
import { Inventory, type ItemStack, type Slots } from './inventory';
import { ITEMS, itemDef, type ItemId } from './items';

/**
 * Bump whenever the save format, the world size or world generation changes. (Adding an
 * optional field that old saves can do without, like `drops` or `tileEntities`, doesn't need a
 * bump, and nor does a new tile id that doesn't renumber the others.)
 */
export const SAVE_VERSION = 1;
/** 'dig-deep:save' on the live site; the dev site uses its own key (see channel.ts). */
export const SAVE_KEY = storageKey('save');

/** The one save slot, as stored in IndexedDB. */
export interface SaveData {
  version: number;
  seed: number;
  /** Date.now() when saved. */
  savedAt: number;
  /** Only chunks changed since generation (the rest regenerate from the seed), RLE-compressed. */
  chunks: { index: number; data: Uint8Array }[];
  /** Player top-left in world px. */
  player: { x: number; y: number };
  inventory: { slots: (ItemStack | null)[]; selected: number };
  /** Items lying on the ground (top-left in world px). Missing in older saves. */
  drops?: SavedDrop[];
  /** Per-tile data such as chest contents. Missing in older saves. */
  tileEntities?: SavedTileEntity[];
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
): SaveData {
  return {
    version: SAVE_VERSION,
    seed: world.seed,
    savedAt: Date.now(),
    chunks: [...world.changedChunks]
      .sort((a, b) => a - b)
      .map((index) => ({ index, data: encodeRle(world.chunks[index]) })),
    player: { x: player.x, y: player.y },
    // Anything held on the mouse goes back in the save as if it had been put away.
    inventory: { slots: savedSlots(inventory), selected: inventory.selected },
    drops: drops.map((d) => ({ item: d.item, count: d.count, x: d.x, y: d.y })),
    tileEntities: entities ? savedTileEntities(entities) : [],
  };
}

/** Tile entities as saved (copies, so later changes don't leak into a save waiting to be written). */
export function savedTileEntities(entities: TileEntities): SavedTileEntity[] {
  return entities.entries().map(({ tx, ty, entity }) => ({ tx, ty, kind: entity.kind, slots: entity.slots.map((s) => s && { ...s }) }));
}

function savedSlots(inventory: Inventory): (ItemStack | null)[] {
  const copy = new Inventory();
  inventory.slots.forEach((s, i) => (copy.slots[i] = s && { ...s }));
  if (inventory.cursor) copy.add(inventory.cursor.item, inventory.cursor.count);
  return copy.slots;
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
    (save.tileEntities === undefined || Array.isArray(save.tileEntities));
  return valid ? { kind: 'ok', save: save as SaveData } : { kind: 'broken' };
}

// --- IndexedDB storage (one slot). ---

export async function readSave(): Promise<SaveStatus> {
  try {
    return checkSave(await get(SAVE_KEY));
  } catch {
    return { kind: 'broken' };
  }
}

export async function writeSave(save: SaveData): Promise<void> {
  await set(SAVE_KEY, save);
}

export async function deleteSave(): Promise<void> {
  await del(SAVE_KEY);
}

/** Debug helper: rewrite the stored save with a different version number. */
export async function markSaveOutdated(): Promise<void> {
  const raw = await get(SAVE_KEY);
  if (raw && typeof raw === 'object') await set(SAVE_KEY, { ...raw, version: SAVE_VERSION - 1 });
}
