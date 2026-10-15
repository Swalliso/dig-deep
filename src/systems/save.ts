import { del, get, set } from 'idb-keyval';
import { CHUNK_SIZE, DROP_SIZE, HOTBAR_SIZE, TILE_SIZE } from '../config';
import { ItemDrop } from '../entities/itemDrop';
import type { Player } from '../entities/player';
import type { World } from '../world/world';
import { Inventory, type ItemStack } from './inventory';
import { ITEMS, itemDef, type ItemId } from './items';

/**
 * Bump whenever the save format, the world size or world generation changes. (Adding an
 * optional field that old saves can do without, like `drops`, doesn't need a bump.)
 */
export const SAVE_VERSION = 1;
const SAVE_KEY = 'dig-deep:save';

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

export function createSave(world: World, player: Player, inventory: Inventory, drops: readonly ItemDrop[]): SaveData {
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
  };
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

/** Rebuild the inventory, skipping anything that no longer exists. */
export function restoreInventory(save: SaveData): Inventory {
  const inventory = new Inventory();
  save.inventory.slots.forEach((s, i) => {
    if (i >= inventory.slots.length || !s || !(s.item in ITEMS) || !(s.count > 0)) return;
    inventory.slots[i] = { item: s.item, count: Math.min(Math.floor(s.count), itemDef(s.item as ItemId).maxStack) };
  });
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
    (save.drops === undefined || Array.isArray(save.drops));
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
