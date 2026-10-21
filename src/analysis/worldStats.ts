import { SURFACE_LEVEL } from '../config';
import { STRATA, stratumAt } from '../world/strata';
import { isSolid, Tile, type TileId } from '../world/tiles';
import type { World } from '../world/world';

// Measuring a generated world for package B (the ore economy): how much of each stratum is open,
// how its caves are sized, how much ore it holds, and how much of that ore a cave shows. Plain
// functions over a World, so a test can run them on a tiny hand-made one; the report scripts
// (scripts/report.mjs) run them on real worlds. Nothing here is part of the game.

/** The ores the reports count, in the order they're listed. */
export const ORE_KINDS: ReadonlyArray<{ name: string; tile: TileId }> = [
  { name: 'Coal', tile: Tile.CoalOre },
  { name: 'Copper', tile: Tile.CopperOre },
  { name: 'Iron', tile: Tile.IronOre },
  { name: 'Gold', tile: Tile.GoldOre },
  { name: 'Rubies', tile: Tile.RubyOre },
  { name: 'Sapphires', tile: Tile.SapphireOre },
  { name: 'Emberite', tile: Tile.EmberiteOre },
];

/** Index into ORE_KINDS of an ore tile, or -1. */
export function oreKindOf(tile: TileId): number {
  return ORE_KINDS.findIndex((k) => k.tile === tile);
}

/** One screen of tiles: 1920 x 1080 at 3x (and 1366 x 768 at 2x, near enough) shows about 40 x 23. */
export const SCREEN_TILES = 40 * 23;
/** Open pockets smaller than this aren't counted as caves (a speck you'd walk past). */
export const MIN_CAVE = 10;

/** Stratum names for a world's report rows; a world without strata is one row. */
export function stratumNames(world: World): string[] {
  return world.strataTops.length > 0 ? STRATA.map((s) => s.name) : ['Whole world'];
}

/** The report row a tile falls in (stratumAt, with a world without strata as row 0). */
export function stratumRow(world: World, tx: number, ty: number): number {
  return Math.max(0, stratumAt(world, tx, ty));
}

/** In the ground: at or below the column's surface row, and not bedrock. */
export function isGround(world: World, tx: number, ty: number): boolean {
  return world.inBounds(tx, ty) && ty >= world.surface[tx] && world.getTile(tx, ty) !== Tile.Bedrock;
}

/** Cave space: anything open (not solid) below the surface row: air, glowshrooms, mushrooms, lava. */
export function isCave(world: World, tx: number, ty: number): boolean {
  return world.inBounds(tx, ty) && ty > world.surface[tx] && !isSolid(world.getTile(tx, ty));
}

/**
 * Open above the ground (sky, trees), or open in the surface row itself (where a cave mouth has
 * carved the grass away): what a cave mouth opens onto.
 */
function isSky(world: World, tx: number, ty: number): boolean {
  return world.inBounds(tx, ty) && ty <= world.surface[tx] && !isSolid(world.getTile(tx, ty));
}

const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];

/** Does tile (tx, ty) have cave space on one of its four sides? */
export function facesCave(world: World, tx: number, ty: number): boolean {
  for (let d = 0; d < 4; d++) if (isCave(world, tx + DX4[d], ty + DY4[d])) return true;
  return false;
}

/**
 * Flood-fill from (tx, ty) over tiles that pass `inside`, marking them in `seen` (index
 * ty * width + tx). `diagonal` also joins tiles touching at a corner. Calls `visit` per tile.
 */
function flood(
  world: World,
  seen: Uint8Array,
  tx: number,
  ty: number,
  diagonal: boolean,
  inside: (x: number, y: number) => boolean,
  visit: (x: number, y: number) => void,
): void {
  const w = world.width;
  const stack = [ty * w + tx];
  seen[ty * w + tx] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    visit(x, y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || (!diagonal && dx !== 0 && dy !== 0)) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!world.inBounds(nx, ny) || seen[ny * w + nx] || !inside(nx, ny)) continue;
        seen[ny * w + nx] = 1;
        stack.push(ny * w + nx);
      }
    }
  }
}

/** A vein: tiles of one ore touching each other (corners count, since veins are random walks). */
export interface Vein {
  kind: number;
  /** Report row of its first tile (ores stay inside their own stratum). */
  stratum: number;
  tiles: number;
  /** Its tiles with cave space on a side. */
  exposed: number;
}

/** Every vein in a world, and which vein each ore tile belongs to (-1 for other tiles). */
export interface Veins {
  veins: Vein[];
  veinOf: Int32Array;
}

export function findVeins(world: World): Veins {
  const { width, height } = world;
  const seen = new Uint8Array(width * height);
  const veinOf = new Int32Array(width * height).fill(-1);
  const veins: Vein[] = [];
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const tile = world.getTile(tx, ty);
      const kind = oreKindOf(tile);
      if (kind < 0 || seen[ty * width + tx]) continue;
      const vein: Vein = { kind, stratum: stratumRow(world, tx, ty), tiles: 0, exposed: 0 };
      const id = veins.length;
      veins.push(vein);
      flood(world, seen, tx, ty, true, (x, y) => world.getTile(x, y) === tile, (x, y) => {
        veinOf[y * width + x] = id;
        vein.tiles++;
        if (facesCave(world, x, y)) vein.exposed++;
      });
    }
  }
  return { veins, veinOf };
}

export interface OreStats {
  tiles: number;
  veins: number;
  /** Tiles with cave space on a side: seen from inside a cave. */
  exposedTiles: number;
  /** Veins with at least one exposed tile: found by exploring, then dug out. */
  exposedVeins: number;
}

export interface StratumStats {
  name: string;
  /** Tiles in the ground (isGround). */
  volume: number;
  /** Cave space among them (isCave). */
  open: number;
  /** Sizes of its caves (open areas inside the stratum, at least MIN_CAVE tiles), biggest first. */
  caves: number[];
  /** Per ORE_KINDS entry. */
  ores: OreStats[];
}

/** A cave (across strata) that opens onto the sky. */
export interface CaveMouth {
  /** A column where it opens. */
  tx: number;
  /** Columns from the spawn column to there. */
  fromSpawn: number;
  /** Its open tiles. */
  size: number;
  /** How deep it reaches, in m below SURFACE_LEVEL. */
  deepest: number;
}

export interface WorldStats {
  seed: number;
  profile: string;
  strata: StratumStats[];
  mouths: CaveMouth[];
}

export function measureWorld(world: World, veins: Veins = findVeins(world)): WorldStats {
  const { width, height } = world;
  const strata: StratumStats[] = stratumNames(world).map((name) => ({
    name,
    volume: 0,
    open: 0,
    caves: [],
    ores: ORE_KINDS.map(() => ({ tiles: 0, veins: 0, exposedTiles: 0, exposedVeins: 0 })),
  }));

  // Volume, open space, ore tiles; caves as open areas within one stratum.
  const inStratum = new Uint8Array(width * height);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (!isGround(world, tx, ty)) continue;
      const s = stratumRow(world, tx, ty);
      const stats = strata[s];
      stats.volume++;
      const kind = oreKindOf(world.getTile(tx, ty));
      if (kind >= 0) {
        stats.ores[kind].tiles++;
        if (facesCave(world, tx, ty)) stats.ores[kind].exposedTiles++;
      }
      if (!isCave(world, tx, ty)) continue;
      stats.open++;
      if (inStratum[ty * width + tx]) continue;
      let size = 0;
      flood(world, inStratum, tx, ty, false, (x, y) => isCave(world, x, y) && stratumRow(world, x, y) === s, () => size++);
      if (size >= MIN_CAVE) stats.caves.push(size);
    }
  }
  for (const stats of strata) stats.caves.sort((a, b) => b - a);
  for (const vein of veins.veins) {
    const ore = strata[vein.stratum].ores[vein.kind];
    ore.veins++;
    if (vein.exposed > 0) ore.exposedVeins++;
  }

  // Cave mouths: whole caves (crossing strata) with sky on a side of one of their tiles.
  const mouths: CaveMouth[] = [];
  const inCave = new Uint8Array(width * height);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (inCave[ty * width + tx] || !isCave(world, tx, ty)) continue;
      let size = 0;
      let deepest = ty;
      let opening = -1;
      flood(world, inCave, tx, ty, false, (x, y) => isCave(world, x, y), (x, y) => {
        size++;
        deepest = Math.max(deepest, y);
        if (opening < 0) for (let d = 0; d < 4; d++) if (isSky(world, x + DX4[d], y + DY4[d])) opening = x;
      });
      if (opening >= 0) mouths.push({ tx: opening, fromSpawn: Math.abs(opening - world.spawnTx), size, deepest: deepest - SURFACE_LEVEL });
    }
  }
  mouths.sort((a, b) => a.tx - b.tx);

  return { seed: world.seed, profile: `${world.profile.name} v${world.profile.version}`, strata, mouths };
}

// --- Report formatting ---

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 12,345 */
export function count(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 12.3% (of a total; – when the total is 0) */
export function percent(part: number, total: number): string {
  return total > 0 ? `${((100 * part) / total).toFixed(1)}%` : '–';
}

/** A markdown table: a header row and rows of cells, the first column left-aligned. */
export function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  const rule = header.map((_, i) => (i === 0 ? '---' : '---:'));
  return [line(header), line(rule), ...rows.map(line)].join('\n');
}

/** The mean over worlds that have cave mouths of how deep their deepest one reaches, or – for none. */
function deepestMean(worlds: readonly WorldStats[]): string {
  const deepest = worlds.filter((w) => w.mouths.length > 0).map((w) => Math.max(...w.mouths.map((m) => m.deepest)));
  return deepest.length > 0 ? count(deepest.reduce((a, b) => a + b, 0) / deepest.length) : '–';
}

/** One row of a per-world table: a label, a cell per world, and a last cell for all of them. */
type Row = [label: string, perWorld: (w: WorldStats) => string, all: string];

/**
 * The world report: a table per stratum (open space, caves, ore) and one for cave mouths, with
 * a column per world and a mean (shares and medians pooled over every world).
 */
export function worldReport(worlds: readonly WorldStats[]): string {
  if (worlds.length === 0) return 'No worlds measured.';
  const n = worlds.length;
  const mean = (f: (w: WorldStats) => number): number => worlds.reduce((sum, w) => sum + f(w), 0) / n;
  const total = (f: (w: WorldStats) => number): number => worlds.reduce((sum, w) => sum + f(w), 0);
  const header = ['', ...worlds.map((w) => `seed ${w.seed}`), n > 1 ? 'mean' : 'all'];
  const render = (rows: Row[]): string => table(header, rows.map(([label, perWorld, all]) => [label, ...worlds.map(perWorld), all]));
  const out: string[] = [
    '# World report',
    '',
    `Profile ${[...new Set(worlds.map((w) => w.profile))].join(', ')} · seeds ${worlds.map((w) => w.seed).join(', ')}.`,
    '',
    `A stratum's tiles are its ground below the surface row (bedrock left out); open means cave space: air, glowshrooms, ` +
      `mushrooms and lava below the surface. A cave is an open area inside one stratum (4-way connected, at least ` +
      `${MIN_CAVE} tiles), so a cave crossing a boundary counts in both strata. A screen is 40 x 23 tiles ` +
      `(${count(SCREEN_TILES)}): 1920 x 1080 at 3x. An ore tile is exposed when it has cave space on a side; a vein ` +
      `(one ore's tiles touching, corners too) touches a cave when any of its tiles is exposed.`,
  ];
  worlds[0].strata.forEach((first, s) => {
    const st = (w: WorldStats): StratumStats => w.strata[s];
    const caves = worlds.flatMap((w) => st(w).caves);
    const rows: Row[] = [
      ['Tiles', (w) => count(st(w).volume), count(mean((w) => st(w).volume))],
      ['Open', (w) => percent(st(w).open, st(w).volume), percent(total((w) => st(w).open), total((w) => st(w).volume))],
      ['Caves', (w) => count(st(w).caves.length), count(mean((w) => st(w).caves.length))],
      ['Median cave (tiles)', (w) => count(median(st(w).caves)), count(median(caves))],
      ['Largest cave (tiles)', (w) => count(st(w).caves[0] ?? 0), count(mean((w) => st(w).caves[0] ?? 0))],
      [`Caves ≥ ¼ screen (${count(SCREEN_TILES / 4)})`, (w) => count(st(w).caves.filter((c) => c >= SCREEN_TILES / 4).length), count(mean((w) => st(w).caves.filter((c) => c >= SCREEN_TILES / 4).length))],
      [`Caves ≥ a screen (${count(SCREEN_TILES)})`, (w) => count(st(w).caves.filter((c) => c >= SCREEN_TILES).length), count(mean((w) => st(w).caves.filter((c) => c >= SCREEN_TILES).length))],
    ];
    ORE_KINDS.forEach((kind, k) => {
      const ore = (w: WorldStats): OreStats => st(w).ores[k];
      if (total((w) => ore(w).tiles) === 0) return;
      const veinCell = (tiles: number, veins: number): string => `${count(veins)} (${veins > 0 ? (tiles / veins).toFixed(1) : '–'})`;
      rows.push(
        [`${kind.name}: tiles`, (w) => count(ore(w).tiles), count(mean((w) => ore(w).tiles))],
        [`${kind.name}: veins (mean size)`, (w) => veinCell(ore(w).tiles, ore(w).veins), veinCell(mean((w) => ore(w).tiles), mean((w) => ore(w).veins))],
        [`${kind.name}: tiles exposed`, (w) => percent(ore(w).exposedTiles, ore(w).tiles), percent(total((w) => ore(w).exposedTiles), total((w) => ore(w).tiles))],
        [`${kind.name}: veins touching a cave`, (w) => percent(ore(w).exposedVeins, ore(w).veins), percent(total((w) => ore(w).exposedVeins), total((w) => ore(w).veins))],
      );
    });
    out.push('', `## ${first.name}`, '', render(rows));
  });
  const mouthRows: Row[] = [
    ['Mouths', (w) => count(w.mouths.length), count(mean((w) => w.mouths.length))],
    ['Largest cave behind one (tiles)', (w) => count(Math.max(0, ...w.mouths.map((m) => m.size))), count(mean((w) => Math.max(0, ...w.mouths.map((m) => m.size))))],
    ['Deepest one reaches (m)', (w) => (w.mouths.length ? count(Math.max(...w.mouths.map((m) => m.deepest))) : '–'), deepestMean(worlds)],
    ['Within 100 tiles of spawn', (w) => count(w.mouths.filter((m) => m.fromSpawn <= 100).length), count(mean((w) => w.mouths.filter((m) => m.fromSpawn <= 100).length))],
  ];
  out.push('', '## Cave mouths', '', 'Caves (whole, across strata) with open sky on a side of one of their tiles.', '', render(mouthRows));
  return out.join('\n');
}
