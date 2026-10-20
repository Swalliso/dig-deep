import { CHUNK_SIZE, SURFACE_LEVEL } from '../config';
import { decodeRle, restoreDifficulty, restoreExplored, restoreInventory, restorePlayTime, type SaveData } from '../systems/save';
import { ITEMS, itemDef, type ItemId } from '../systems/items';
import { profileLabel } from '../world/generate';
import { Tile, type TileId } from '../world/tiles';
import type { World } from '../world/world';
import { count, facesCave, findVeins, isGround, ORE_KINDS, oreKindOf, percent, stratumNames, stratumRow, table, type Veins } from './worldStats';

// Measuring a playthrough from its world backups (package B): a backup holds the seed, the
// generation profile, the play time, the chunks changed since generation, the explored map and
// the inventory, so comparing its chunks with the world regenerated from the seed shows what was
// dug and mined where, and whether each vein mined was one a cave showed. Nothing here is part
// of the game; scripts/report.mjs runs it on backup files.

/** Items the report counts, carried and in chests. */
export const TRACKED_ITEMS: readonly ItemId[] = [
  'coal',
  'copper_ore',
  'iron_ore',
  'gold_ore',
  'ruby',
  'sapphire',
  'emberite_ore',
  'copper_bar',
  'iron_bar',
  'gold_bar',
  'emberite_bar',
  'torch',
];

export interface OreMined {
  /** Ore tiles changed to anything else. */
  mined: number;
  /** ...of a vein that touched generated cave space (found from a cave, then dug out). */
  fromCaveVein: number;
  /** ...that had generated cave space on a side themselves. */
  facedCave: number;
}

export interface BackupStats {
  label: string;
  seed: number;
  profile: string;
  difficulty: string;
  /** Seconds of play. */
  playTime: number;
  strata: {
    name: string;
    /** Ground tiles (isGround in the generated world). */
    volume: number;
    /** Generated ground tiles that are something else now. */
    dug: number;
    /** Ground tiles seen on the map. */
    explored: number;
    /** Torches standing where generation had something else. */
    torches: number;
    /** Per ORE_KINDS entry. */
    ores: OreMined[];
  }[];
  /** The deepest explored tile, in m below SURFACE_LEVEL, or null with no map. */
  deepestSeen: number | null;
  /** The best pickaxe carried, or null for none. */
  pickaxe: string | null;
  /** TRACKED_ITEMS carried (hotbar and bag) and in chests. */
  carried: Partial<Record<ItemId, number>>;
  stored: Partial<Record<ItemId, number>>;
}

/**
 * Compare a save with its world as generated (from the save's seed and profile; not changed
 * here). `veins` can be passed in when several backups share a world.
 */
export function measureBackup(label: string, save: SaveData, generated: World, veins: Veins = findVeins(generated)): BackupStats {
  const world = generated;
  const strata = stratumNames(world).map((name) => ({
    name,
    volume: 0,
    dug: 0,
    explored: 0,
    torches: 0,
    ores: ORE_KINDS.map(() => ({ mined: 0, fromCaveVein: 0, facedCave: 0 })),
  }));
  for (let ty = 0; ty < world.height; ty++) {
    for (let tx = 0; tx < world.width; tx++) if (isGround(world, tx, ty)) strata[stratumRow(world, tx, ty)].volume++;
  }

  for (const { index, data } of save.chunks) {
    if (!Number.isInteger(index) || index < 0 || index >= world.chunks.length) continue;
    const tiles = decodeRle(data, CHUNK_SIZE * CHUNK_SIZE);
    const x0 = (index % world.chunksX) * CHUNK_SIZE;
    const y0 = Math.floor(index / world.chunksX) * CHUNK_SIZE;
    for (let i = 0; i < tiles.length; i++) {
      const tx = x0 + (i % CHUNK_SIZE);
      const ty = y0 + Math.floor(i / CHUNK_SIZE);
      if (!world.inBounds(tx, ty)) continue;
      const was = world.getTile(tx, ty);
      const now = tiles[i] as TileId;
      if (now === was) continue;
      const row = strata[stratumRow(world, tx, ty)];
      if (now === Tile.Torch) row.torches++;
      if (was === Tile.Air || !isGround(world, tx, ty)) continue;
      row.dug++;
      const kind = oreKindOf(was);
      if (kind < 0) continue;
      const ore = row.ores[kind];
      ore.mined++;
      const vein = veins.veins[veins.veinOf[ty * world.width + tx]];
      if (vein && vein.exposed > 0) ore.fromCaveVein++;
      if (facesCave(world, tx, ty)) ore.facedCave++;
    }
  }

  let deepest = -1;
  restoreExplored(save, world).forEachExplored((tx, ty) => {
    deepest = Math.max(deepest, ty);
    if (isGround(world, tx, ty)) strata[stratumRow(world, tx, ty)].explored++;
  });

  const inventory = restoreInventory(save);
  const tier = inventory.bestPickaxeTier();
  const pickaxe = (Object.keys(ITEMS) as ItemId[]).find((id) => itemDef(id).pickaxeTier === tier);
  const tally = (stacks: readonly unknown[], into: Partial<Record<ItemId, number>>): void => {
    for (const raw of stacks) {
      const s = raw as { item?: ItemId; count?: number } | null;
      if (s?.item && TRACKED_ITEMS.includes(s.item) && typeof s.count === 'number') into[s.item] = (into[s.item] ?? 0) + s.count;
    }
  };
  const carried: Partial<Record<ItemId, number>> = {};
  const stored: Partial<Record<ItemId, number>> = {};
  tally(inventory.slots, carried);
  for (const e of save.tileEntities ?? []) if (e?.kind === 'chest' && Array.isArray(e.slots)) tally(e.slots, stored);

  return {
    label,
    seed: save.seed,
    profile: profileLabel(world.profile),
    difficulty: restoreDifficulty(save) === 'normal' ? 'Normal' : 'Cozy',
    playTime: restorePlayTime(save),
    strata,
    deepestSeen: deepest < 0 ? null : deepest - SURFACE_LEVEL,
    pickaxe: pickaxe ? itemDef(pickaxe).name : null,
    carried,
    stored,
  };
}

/** 1:05:09 or 42:10 */
export function playTimeLabel(seconds: number): string {
  const s = Math.floor(seconds);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
}

/** "coal × 12, iron bar × 3" (or "none") */
function itemList(items: Partial<Record<ItemId, number>>): string {
  const parts = TRACKED_ITEMS.filter((id) => items[id]).map((id) => `${itemDef(id).name.toLowerCase()} × ${items[id]}`);
  return parts.length > 0 ? parts.join(', ') : 'none';
}

function totals(b: BackupStats): { dug: number; mined: number; fromCave: number; torches: number } {
  let dug = 0;
  let mined = 0;
  let fromCave = 0;
  let torches = 0;
  for (const s of b.strata) {
    dug += s.dug;
    torches += s.torches;
    for (const o of s.ores) {
      mined += o.mined;
      fromCave += o.fromCaveVein;
    }
  }
  return { dug, mined, fromCave, torches };
}

/**
 * The backup report: a timeline (one row per backup, grouped by world and in play-time order),
 * then each backup's strata, ore mined and items.
 */
export function backupReport(backups: readonly BackupStats[]): string {
  if (backups.length === 0) return 'No backups read.';
  const seeds = [...new Set(backups.map((b) => b.seed))];
  const ordered = [...backups].sort((a, b) => seeds.indexOf(a.seed) - seeds.indexOf(b.seed) || a.playTime - b.playTime);
  const out: string[] = [
    '# Backup report',
    '',
    'Dug: ground tiles that differ from the generated world. Ore from a cave: mined ore whose vein had a tile facing ' +
      'generated cave space (found by exploring); the rest was reached by digging. Explored: ground tiles seen on the ' +
      'map (it marks 5 tiles around the player through rock, and anything lit on screen).',
    '',
    '## Timeline',
    '',
    table(
      ['Backup', 'Seed', 'Played', 'Pickaxe', 'Deepest seen', 'Dug', 'Ore mined', 'From a cave', 'Torches placed'],
      ordered.map((b) => {
        const t = totals(b);
        return [
          b.label,
          String(b.seed),
          playTimeLabel(b.playTime),
          b.pickaxe ?? 'none',
          b.deepestSeen === null ? '–' : `${b.deepestSeen} m`,
          count(t.dug),
          count(t.mined),
          percent(t.fromCave, t.mined),
          count(t.torches),
        ];
      }),
    ),
  ];
  for (const b of ordered) {
    out.push(
      '',
      `## ${b.label}`,
      '',
      `Seed ${b.seed} · ${b.profile} · ${b.difficulty} · ${playTimeLabel(b.playTime)} played · ${b.pickaxe ?? 'no pickaxe'}`,
      '',
      table(
        ['Stratum', 'Dug', 'Explored', 'Torches placed'],
        b.strata.map((s) => [s.name, count(s.dug), `${count(s.explored)} (${percent(s.explored, s.volume)})`, count(s.torches)]),
      ),
    );
    const oreRows = b.strata.flatMap((s) =>
      s.ores.flatMap((o, k) =>
        o.mined > 0 ? [[ORE_KINDS[k].name, s.name, count(o.mined), percent(o.fromCaveVein, o.mined), percent(o.mined - o.fromCaveVein, o.mined), percent(o.facedCave, o.mined)]] : [],
      ),
    );
    out.push(
      '',
      oreRows.length > 0
        ? table(['Ore', 'Stratum', 'Mined', 'From a cave (vein)', 'Buried (vein)', 'Tile faced a cave'], oreRows)
        : 'No ore mined yet.',
      '',
      `Carried: ${itemList(b.carried)}. In chests: ${itemList(b.stored)}.`,
    );
  }
  return out.join('\n');
}
