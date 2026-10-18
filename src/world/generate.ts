import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import {
  BEDROCK_BOTTOM_ROWS,
  CAVE_CRUST_HARD,
  CAVE_CRUST_PENALTY,
  CAVE_DETAIL_SCALE,
  CAVE_DETAIL_WEIGHT,
  CAVE_NOISE_SCALE_X,
  CAVE_NOISE_SCALE_Y,
  CAVE_SOLID_CRUST,
  CAVE_THRESHOLD_DEEP,
  CAVE_THRESHOLD_SHALLOW,
  DEEPSTONE_JITTER,
  DEEPSTONE_NOISE_SCALE,
  DEEPSTONE_ROW,
  DEPTHS_GEN,
  DIRT_DEPTH_MAX,
  DIRT_DEPTH_MIN,
  DIRT_NOISE_SCALE,
  GIANT_MUSHROOM_STEM_MAX,
  GRAVEL_POCKETS,
  ORE_COAL,
  ORE_COPPER,
  ORE_GOLD,
  ORE_IRON,
  STRATA_COAL,
  STRATA_COPPER,
  STRATA_EMBERITE,
  STRATA_GEN,
  STRATA_GOLD,
  STRATA_IRON,
  STRATA_RUBY,
  STRATA_SAPPHIRE,
  SURFACE_AMPLITUDE,
  SURFACE_LEVEL,
  SURFACE_NOISE_SCALES,
  SURFACE_NOISE_WEIGHTS,
  TREE_EDGE_MARGIN,
  TREE_LEAF_RAGGEDNESS,
  TREE_SPACING_MAX,
  TREE_SPACING_MIN,
  TREE_TRUNK_MAX,
  TREE_TRUNK_MIN,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type DepthsGenSpec,
  type GravelSpec,
  type OreSpec,
  type StrataGenSpec,
} from '../config';
import { createRng, randInt, type Rng } from '../util/rng';
import { growGiantMushroom } from './plants';
import { STRATA, stratumAt } from './strata';
import { isSolid, Tile, tileDef, type TileId } from './tiles';
import { World } from './world';

export interface GenProgress {
  label: string;
  /** 0..1 */
  progress: number;
}

export const ORE_LAYERS: ReadonlyArray<{ tile: TileId; spec: OreSpec }> = [
  { tile: Tile.CoalOre, spec: ORE_COAL },
  { tile: Tile.CopperOre, spec: ORE_COPPER },
  { tile: Tile.IronOre, spec: ORE_IRON },
  { tile: Tile.GoldOre, spec: ORE_GOLD },
];

/** The strata profile's ores (Phase 14a): each one only in its own stratum's rock. */
export const STRATA_ORES: ReadonlyArray<{ tile: TileId; spec: OreSpec }> = [
  { tile: Tile.CoalOre, spec: STRATA_COAL },
  { tile: Tile.CopperOre, spec: STRATA_COPPER },
  { tile: Tile.IronOre, spec: STRATA_IRON },
  { tile: Tile.GoldOre, spec: STRATA_GOLD },
  { tile: Tile.RubyOre, spec: STRATA_RUBY },
  { tile: Tile.SapphireOre, spec: STRATA_SAPPHIRE },
  { tile: Tile.EmberiteOre, spec: STRATA_EMBERITE },
];

/**
 * How a world is generated. Saves regenerate unchanged chunks from the seed, so a world keeps the
 * profile it was made with (its name and version are saved with it) and new generation features
 * arrive in new profiles: an existing profile must never change what it generates. World size,
 * layers and caves are shared settings in config.ts for now; a profile names what differs.
 */
export interface GenProfile {
  name: string;
  version: number;
  ores: ReadonlyArray<{ tile: TileId; spec: OreSpec }>;
  /** Gravel pockets, or null for none. */
  gravel: GravelSpec | null;
  /**
   * Strata (Phase 14a): depth bands with their own rock, ores and growths, or null for one layer
   * of stone over deepstone.
   */
  strata: StrataGenSpec | null;
  /**
   * The strata's rules (Phase 14b, needs strata): floatstone, hot rock, lava pools and the Heart
   * of the Deep, or null for none.
   */
  depths: DepthsGenSpec | null;
}

/** Which profile a world was generated with, as saved. */
export interface ProfileRef {
  name: string;
  version: number;
}

/** Generation as it was up to Phase 11: frozen, so worlds made then keep regenerating the same. */
export const CLASSIC_PROFILE: GenProfile = { name: 'classic', version: 1, ores: ORE_LAYERS, gravel: null, strata: null, depths: null };
/** Phase 12: classic plus gravel pockets. Frozen too. */
export const GRAVEL_PROFILE: GenProfile = { name: 'gravel', version: 1, ores: ORE_LAYERS, gravel: GRAVEL_POCKETS, strata: null, depths: null };
/**
 * Phase 14a: strata (Topsoil, Stone Caverns, Fungal Hollows, Geode Depths, Magma Layer), each
 * with its own rock and ores; giant mushrooms and glowshrooms in the Hollows, huge glowing
 * crystal caverns in the Geode Depths; and the gravel pockets. Frozen too.
 */
export const STRATA_PROFILE: GenProfile = { name: 'strata', version: 1, ores: STRATA_ORES, gravel: GRAVEL_POCKETS, strata: STRATA_GEN, depths: null };
/**
 * Phase 14b: strata v1 plus what the strata's rules need: floatstone in the Geode Depths' huge
 * caverns, hot rock and lava pools in the Magma Layer, and the Heart of the Deep's chamber above
 * the bedrock. Everything v1 generates is generated the same way first.
 */
export const STRATA_V2_PROFILE: GenProfile = { ...STRATA_PROFILE, version: 2, depths: DEPTHS_GEN };
export const PROFILES: readonly GenProfile[] = [CLASSIC_PROFILE, GRAVEL_PROFILE, STRATA_PROFILE, STRATA_V2_PROFILE];
/** What new worlds are generated with. */
export const NEW_WORLD_PROFILE = STRATA_V2_PROFILE;

/** The profile a save names, or null if this version doesn't know it. */
export function findProfile(ref: ProfileRef): GenProfile | null {
  return PROFILES.find((p) => p.name === ref.name && p.version === ref.version) ?? null;
}

/** "gravel v1" */
export function profileLabel(ref: ProfileRef): string {
  return `${ref.name} v${ref.version}`;
}

const STEP_COUNT = 7;
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

/** Generate a whole world in one go (tests, and anywhere a loading screen isn't needed). */
export function generateWorld(seed: number, profile: GenProfile = CLASSIC_PROFILE): World {
  const world = new World(WORLD_WIDTH, WORLD_HEIGHT, seed);
  const steps = generateWorldSteps(world, profile);
  while (!steps.next().done) {
    // run every step
  }
  return world;
}

/**
 * Fill an empty world from its seed. Yields progress often so the caller can spread the work
 * over several frames. All randomness comes from RNGs derived from the seed.
 */
export function* generateWorldSteps(world: World, profile: GenProfile): Generator<GenProgress, void, void> {
  const seed = world.seed;
  world.profile = { name: profile.name, version: profile.version };
  const subRng = (salt: number): Rng => createRng((seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0);
  const progress = (step: number, label: string): GenProgress => ({ label, progress: step / STEP_COUNT });
  const { width, height } = world;
  const strata = profile.strata;

  // 1. Surface height: layered 1D noise, rolling hills around SURFACE_LEVEL.
  yield progress(0, 'Shaping hills');
  const surfaceNoise = createNoise2D(subRng(1));
  for (let tx = 0; tx < width; tx++) {
    let n = 0;
    for (let o = 0; o < SURFACE_NOISE_SCALES.length; o++) {
      n += SURFACE_NOISE_WEIGHTS[o] * surfaceNoise(tx / SURFACE_NOISE_SCALES[o], o * 31.7);
    }
    world.surface[tx] = Math.round(SURFACE_LEVEL + n * SURFACE_AMPLITUDE);
  }

  // 2. Layers: grass, a noisy band of dirt, stone, then deepstone below a noisy boundary (or,
  //    with strata, each stratum's rock between its wandering boundaries).
  yield progress(1, 'Layering dirt and stone');
  const dirtNoise = createNoise2D(subRng(2));
  const deepNoise = createNoise2D(subRng(3));
  const boundaryNoise = strata ? [8, 9, 10, 11].map((salt) => createNoise2D(subRng(salt))) : [];
  if (strata) world.strataTops = boundaryNoise.map(() => new Int16Array(width));
  for (let tx = 0; tx < width; tx++) {
    const s = world.surface[tx];
    const dirtT = (dirtNoise(tx / DIRT_NOISE_SCALE, 0) + 1) / 2;
    const dirtDepth = Math.round(DIRT_DEPTH_MIN + dirtT * (DIRT_DEPTH_MAX - DIRT_DEPTH_MIN));
    world.setTile(tx, s, Tile.Grass);
    if (strata) {
      layerStrata(world, strata, boundaryNoise, tx, s + dirtDepth);
    } else {
      const deepRow = DEEPSTONE_ROW + Math.round(deepNoise(tx / DEEPSTONE_NOISE_SCALE, 0) * DEEPSTONE_JITTER);
      for (let ty = s + 1; ty < height; ty++) {
        world.setTile(tx, ty, ty <= s + dirtDepth ? Tile.Dirt : ty >= deepRow ? Tile.Deepstone : Tile.Stone);
      }
    }
    if (tx % 100 === 99) yield progress(1 + tx / width, 'Layering dirt and stone');
  }

  // 3. Caves: carve where 2D noise beats a threshold that drops with depth.
  //    The crust just under the surface gets a big threshold penalty so it stays mostly solid.
  yield progress(2, 'Carving caves');
  const caveNoise = createNoise2D(subRng(4));
  const depthSpan = height - SURFACE_LEVEL;
  for (let tx = 0; tx < width; tx++) {
    const s = world.surface[tx];
    for (let ty = s + CAVE_CRUST_HARD; ty < height; ty++) {
      const depthT = Math.min(1, Math.max(0, (ty - SURFACE_LEVEL) / depthSpan));
      let threshold = CAVE_THRESHOLD_SHALLOW + (CAVE_THRESHOLD_DEEP - CAVE_THRESHOLD_SHALLOW) * depthT;
      const d = ty - s;
      if (d < CAVE_SOLID_CRUST) {
        threshold += CAVE_CRUST_PENALTY * (1 - (d - CAVE_CRUST_HARD) / (CAVE_SOLID_CRUST - CAVE_CRUST_HARD));
      }
      const n =
        (1 - CAVE_DETAIL_WEIGHT) * caveNoise(tx / CAVE_NOISE_SCALE_X, ty / CAVE_NOISE_SCALE_Y) +
        CAVE_DETAIL_WEIGHT *
          caveNoise(tx / (CAVE_NOISE_SCALE_X * CAVE_DETAIL_SCALE) + 100, ty / (CAVE_NOISE_SCALE_Y * CAVE_DETAIL_SCALE));
      if (n > threshold) world.setTile(tx, ty, Tile.Air);
    }
    if (tx % 25 === 24) yield progress(2 + tx / width, 'Carving caves');
  }

  // 3b. Strata: huge crystal caverns in the Geode Depths, from their own noise.
  const cavernNoise = strata ? createNoise2D(subRng(12)) : null;
  if (strata && cavernNoise) {
    yield progress(2.95, 'Hollowing crystal caverns');
    carveCrystalCaverns(world, cavernNoise, strata);
  }

  // 4. Ores: random-walk veins, only into stone/deepstone (strata: their own stratum's rock),
  //    only inside each ore's depth band.
  const oreRng = subRng(5);
  for (let i = 0; i < profile.ores.length; i++) {
    yield progress(3 + i / profile.ores.length, 'Placing ores');
    placeOreVeins(world, oreRng, profile.ores[i].tile, profile.ores[i].spec, strata ? strata.jitter : 0);
  }

  // 4b. Gravel pockets (not in classic), from their own RNG so nothing else changes. With strata
  //     they're in the Stone Caverns' stone and the Fungal Hollows' mudstone.
  if (profile.gravel) {
    yield progress(3.9, 'Loosening gravel');
    placeGravelPockets(world, subRng(7), profile.gravel, profile.ores, strata !== null);
  }

  // 5. Trees on flat stretches of grass.
  yield progress(4, 'Growing trees');
  placeTrees(world, subRng(6));

  // 5b. Strata: giant mushrooms and glowshrooms on the Fungal Hollows' floors, glow crystals in
  //     the Geode Depths' rock faces.
  if (strata && cavernNoise) {
    yield progress(4.4, 'Growing glowshrooms');
    growHollows(world, subRng(13), createNoise2D(subRng(14)), strata);
    yield progress(4.7, 'Lighting crystals');
    placeGlowCrystals(world, subRng(15), cavernNoise, strata);
  }

  // 5c. The strata's rules (strata v2): floatstone in the huge caverns, the Heart of the Deep's
  //     chamber, then hot rock and lava pools in the Magma Layer (kept clear of the chamber).
  const depths = profile.depths;
  if (strata && cavernNoise && depths) {
    yield progress(4.8, 'Floating stones');
    placeFloatstone(world, subRng(16), cavernNoise, strata, depths);
    yield progress(4.85, 'Sealing the Heart');
    placeHeart(world, subRng(17), depths);
    yield progress(4.9, 'Heating the depths');
    placeHotRock(world, subRng(18), depths);
    placeLavaPools(world, subRng(19), depths);
  }

  // 6. Bedrock: both side columns and the bottom rows.
  yield progress(5, 'Adding bedrock');
  for (let ty = 0; ty < height; ty++) {
    world.setTile(0, ty, Tile.Bedrock);
    world.setTile(width - 1, ty, Tile.Bedrock);
  }
  for (let ty = height - BEDROCK_BOTTOM_ROWS; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) world.setTile(tx, ty, Tile.Bedrock);
  }

  // 7. Spawn: middle column, standing on the first solid tile from the top.
  yield progress(6, 'Choosing spawn point');
  const spawnTx = Math.floor(width / 2);
  let spawnTy = 0;
  while (spawnTy < height - 1 && !tileDef(world.getTile(spawnTx, spawnTy + 1)).solid) spawnTy++;
  world.spawnTx = spawnTx;
  world.spawnTy = spawnTy;
  world.changedChunks.clear(); // from here on, changes are the player's

  yield progress(STEP_COUNT, 'Done');
}

/**
 * Seed from what the player typed: a whole number is used as is, any other text is hashed
 * (FNV-1a), and an empty field picks a random seed.
 */
export function parseSeed(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return Math.floor(Math.random() * 1_000_000_000);
  const n = Number(trimmed);
  if (Number.isInteger(n)) return n >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Absolute rows [top, bottom] an ore may occupy, clipped to above the bedrock floor. `pad` widens
 * the band at both ends (strata ores reach their stratum's wandering boundaries).
 */
export function oreRowRange(world: World, spec: OreSpec, pad = 0): [number, number] {
  const top = SURFACE_LEVEL + spec.minDepth - pad;
  const bottom = Math.min(SURFACE_LEVEL + spec.maxDepth + pad, world.height - 1 - BEDROCK_BOTTOM_ROWS);
  return [top, bottom];
}

/**
 * Strata layers for column tx, below its grass: dirt down to `dirtBottom`, then each stratum's
 * rock between its boundaries (Topsoil's stone under the dirt is the Stone Caverns' stone). Each
 * boundary wanders around its nominal depth; Topsoil reaches at least to the bottom of the dirt,
 * and every stratum is at least a tile thick. Records the boundaries in world.strataTops.
 */
function layerStrata(world: World, spec: StrataGenSpec, noise: NoiseFunction2D[], tx: number, dirtBottom: number): void {
  const tops = world.strataTops;
  for (let k = 0; k < tops.length; k++) {
    const row = SURFACE_LEVEL + spec.tops[k] + Math.round(noise[k](tx / spec.noiseScale, 0) * spec.jitter);
    tops[k][tx] = Math.max(row, k === 0 ? dirtBottom + 1 : tops[k - 1][tx] + 1);
  }
  let s = 1;
  for (let ty = world.surface[tx] + 1; ty < world.height; ty++) {
    if (ty <= dirtBottom) {
      world.setTile(tx, ty, Tile.Dirt);
      continue;
    }
    while (s < tops.length && ty >= tops[s][tx]) s++;
    world.setTile(tx, ty, STRATA[s].rock);
  }
}

/**
 * Huge caverns in the Geode Depths: open air where low-frequency noise beats the threshold,
 * which rises near the stratum's edges so they round off inside it.
 */
function carveCrystalCaverns(world: World, noise: NoiseFunction2D, spec: StrataGenSpec): void {
  const [, , geode, magma] = world.strataTops;
  for (let tx = 1; tx < world.width - 1; tx++) {
    for (let ty = geode[tx]; ty < magma[tx]; ty++) {
      const edge = Math.min(ty - geode[tx], magma[tx] - 1 - ty);
      const threshold = spec.cavernThreshold + Math.max(0, spec.cavernEdge - edge) * spec.cavernEdgePenalty;
      if (noise(tx / spec.cavernScaleX, ty / spec.cavernScaleY) > threshold) world.setTile(tx, ty, Tile.Air);
    }
  }
}

function placeOreVeins(world: World, rng: Rng, tile: TileId, spec: OreSpec, pad: number): void {
  const [top, bottom] = oreRowRange(world, spec, pad);
  if (bottom < top) return;
  const stratum = spec.stratum;
  const rock = stratum === undefined ? null : STRATA[stratum].rock;
  const veins = Math.round(((bottom - top + 1) * world.width) / spec.tilesPerVein);
  for (let v = 0; v < veins; v++) {
    let tx = randInt(rng, 1, world.width - 2);
    let ty = randInt(rng, top, bottom);
    const size = randInt(rng, spec.veinMin, spec.veinMax);
    let placed = 0;
    for (let step = 0; step < size * 4 && placed < size; step++) {
      const current = world.getTile(tx, ty);
      const fits = rock === null ? current === Tile.Stone || current === Tile.Deepstone : current === rock && stratumAt(world, tx, ty) === stratum;
      if (fits) {
        world.setTile(tx, ty, tile);
        placed++;
      }
      const dir = randInt(rng, 0, 3);
      tx = Math.min(world.width - 2, Math.max(1, tx + DX[dir]));
      ty = Math.min(bottom, Math.max(top, ty + DY[dir]));
    }
  }
}

/**
 * Gravel pockets: ragged ellipses of gravel, replacing stone only (with strata: the Stone
 * Caverns' stone and the Fungal Hollows' mudstone). Some are moved up onto a cave ceiling found
 * below their spot, so their bottom row hangs over the cave (still until disturbed); deeper
 * ceiling pockets may get ore in their bottom rows. Pockets above spec.gentleDepth are small.
 */
function placeGravelPockets(world: World, rng: Rng, spec: GravelSpec, ores: GenProfile['ores'], strata: boolean): void {
  /** Can gravel replace the tile at (tx, ty)? */
  const rock = strata
    ? (tx: number, ty: number): boolean => {
        const tile = world.getTile(tx, ty);
        return tile === Tile.Mudstone || (tile === Tile.Stone && stratumAt(world, tx, ty) >= 1);
      }
    : (tx: number, ty: number): boolean => world.getTile(tx, ty) === Tile.Stone;
  /**
   * The ore for a rich pocket centred at (cx, cy) to put at (tx, ty): the best ore for the
   * pocket's depth, or with strata, the best ore of its stratum (none at a tile across a boundary).
   */
  const oreAt = strata
    ? (tx: number, ty: number, cx: number, cy: number): TileId | null => {
        const s = stratumAt(world, cx, cy);
        if (stratumAt(world, tx, ty) !== s) return null;
        let ore: TileId | null = null;
        for (const layer of ores) if (layer.spec.stratum === s) ore = layer.tile;
        return ore;
      }
    : (_tx: number, _ty: number, _cx: number, cy: number): TileId | null => {
        const depth = cy - SURFACE_LEVEL;
        let ore: TileId | null = null;
        for (const layer of ores) if (depth >= layer.spec.minDepth && depth <= layer.spec.maxDepth) ore = layer.tile;
        return ore;
      };
  const top = SURFACE_LEVEL + spec.minDepth;
  const bottom = world.height - 1 - BEDROCK_BOTTOM_ROWS - 2;
  const pockets = Math.round(((bottom - top + 1) * world.width) / spec.tilesPerPocket);
  for (let p = 0; p < pockets; p++) {
    const cx = randInt(rng, 3, world.width - 4);
    let cy = randInt(rng, top, bottom);
    const gentle = cy - SURFACE_LEVEL < spec.gentleDepth;
    const rx = gentle ? randInt(rng, 1, spec.gentleRadiusMax) : randInt(rng, spec.radiusMin, spec.radiusMax);
    const ry = Math.max(1, rx - 1);
    let ceiling = false;
    if (rng() < spec.ceilingShare) {
      // The first rock tile with air under it, below the spot: the pocket's bottom row goes there.
      for (let y = cy; y < Math.min(bottom, cy + spec.ceilingSearch); y++) {
        if (rock(cx, y) && world.getTile(cx, y + 1) === Tile.Air) {
          cy = y - ry;
          ceiling = true;
          break;
        }
      }
    }
    const placed: [number, number][] = [];
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const d = (dx / (rx + 0.5)) ** 2 + (dy / (ry + 0.5)) ** 2;
        if (d > 1 || (d > 0.6 && rng() < 0.35)) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (ty < top || ty > bottom || !rock(tx, ty)) continue;
        world.setTile(tx, ty, Tile.Gravel);
        placed.push([tx, ty]);
      }
    }
    // A ceiling pocket reaches down to the cave wherever only a tile or two of rock is left under it.
    if (ceiling) {
      for (let tx = cx - rx; tx <= cx + rx; tx++) {
        let low = -1;
        for (const [x, y] of placed) if (x === tx) low = Math.max(low, y);
        if (low < 0) continue;
        for (let k = 1; k <= 3; k++) {
          if (world.getTile(tx, low + k) === Tile.Air) {
            for (let y = low + 1; y < low + k; y++) {
              if (!rock(tx, y)) break;
              world.setTile(tx, y, Tile.Gravel);
              placed.push([tx, y]);
            }
            break;
          }
          if (!rock(tx, low + k)) break;
        }
      }
    }
    // Ore in the bottom rows of a deep ceiling pocket.
    if (!ceiling || cy - SURFACE_LEVEL < spec.richMinDepth || rng() >= spec.richChance || placed.length === 0) continue;
    if (oreAt(cx, cy, cx, cy) === null) continue;
    const low = placed.filter(([, ty]) => ty >= cy);
    for (let i = 0; i < spec.richOres && low.length > 0; i++) {
      const [tx, ty] = low.splice(randInt(rng, 0, low.length - 1), 1)[0];
      const ore = oreAt(tx, ty, cx, cy);
      if (ore !== null) world.setTile(tx, ty, ore);
    }
  }
}

function placeTrees(world: World, rng: Rng): void {
  let tx = TREE_EDGE_MARGIN + randInt(rng, 0, TREE_SPACING_MAX);
  while (tx < world.width - TREE_EDGE_MARGIN) {
    const s = world.surface[tx];
    const flat =
      world.surface[tx - 1] === s &&
      world.surface[tx + 1] === s &&
      world.getTile(tx - 1, s) === Tile.Grass &&
      world.getTile(tx, s) === Tile.Grass &&
      world.getTile(tx + 1, s) === Tile.Grass;
    if (!flat) {
      tx++;
      continue;
    }

    const trunk = randInt(rng, TREE_TRUNK_MIN, TREE_TRUNK_MAX);
    for (let i = 1; i <= trunk; i++) world.setTile(tx, s - i, Tile.Wood);

    // Round leaf blob centred just above the trunk top, with a ragged edge.
    const cy = s - trunk - 1;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > 5) continue;
        if (d2 >= 4 && rng() < TREE_LEAF_RAGGEDNESS) continue;
        if (world.getTile(tx + dx, cy + dy) === Tile.Air) world.setTile(tx + dx, cy + dy, Tile.Leaves);
      }
    }

    tx += randInt(rng, TREE_SPACING_MIN, TREE_SPACING_MAX);
  }
}

/**
 * The Fungal Hollows' floors (open air over mudstone): now and then a giant mushroom where there's
 * room (at least spec.giantMushroomSpacing columns apart, and far enough below the stratum's top
 * that the tallest one stays inside it), and glowshrooms, thick in patches and rare between
 * them, so some stretches are lit and others dark.
 */
function growHollows(world: World, rng: Rng, patchNoise: NoiseFunction2D, spec: StrataGenSpec): void {
  const [, hollows, geode] = world.strataTops;
  const tallest = GIANT_MUSHROOM_STEM_MAX + 3; // stem and cap
  let nextMushroom = 0;
  for (let tx = 3; tx < world.width - 3; tx++) {
    const roof = Math.max(...hollows.subarray(tx - 3, tx + 4)) + tallest;
    for (let ty = hollows[tx]; ty < geode[tx]; ty++) {
      if (world.getTile(tx, ty) !== Tile.Air || world.getTile(tx, ty + 1) !== Tile.Mudstone) continue;
      if (tx >= nextMushroom && ty >= roof && rng() < spec.giantMushroomChance && growGiantMushroom(world, tx, ty, rng)) {
        nextMushroom = tx + spec.giantMushroomSpacing;
        continue;
      }
      const patch = patchNoise(tx / spec.glowshroomPatchScale, ty / spec.glowshroomPatchScale) > spec.glowshroomPatchThreshold;
      if (rng() < (patch ? spec.glowshroomPatchChance : spec.glowshroomChance)) world.setTile(tx, ty, Tile.Glowshroom);
    }
  }
}

/**
 * Glow crystals in the Geode Depths' rock faces (deepstone next to open air): plenty in the huge
 * caverns, a few elsewhere.
 */
function placeGlowCrystals(world: World, rng: Rng, cavernNoise: NoiseFunction2D, spec: StrataGenSpec): void {
  const [, , geode, magma] = world.strataTops;
  const open = (tx: number, ty: number): boolean => world.getTile(tx, ty) === Tile.Air;
  for (let tx = 1; tx < world.width - 1; tx++) {
    for (let ty = geode[tx]; ty < magma[tx]; ty++) {
      if (world.getTile(tx, ty) !== Tile.Deepstone) continue;
      if (!open(tx - 1, ty) && !open(tx + 1, ty) && !open(tx, ty - 1) && !open(tx, ty + 1)) continue;
      const cavern = cavernNoise(tx / spec.cavernScaleX, ty / spec.cavernScaleY) > spec.cavernThreshold - 0.1;
      if (rng() < (cavern ? spec.crystalCavernChance : spec.crystalChance)) world.setTile(tx, ty, Tile.GlowCrystal);
    }
  }
}

/**
 * Floatstone on the rock faces (deepstone next to open air) inside the Geode Depths' huge
 * caverns, so their open air has low gravity.
 */
function placeFloatstone(world: World, rng: Rng, cavernNoise: NoiseFunction2D, strata: StrataGenSpec, spec: DepthsGenSpec): void {
  const [, , geode, magma] = world.strataTops;
  const open = (tx: number, ty: number): boolean => world.getTile(tx, ty) === Tile.Air;
  for (let tx = 1; tx < world.width - 1; tx++) {
    for (let ty = geode[tx]; ty < magma[tx]; ty++) {
      if (world.getTile(tx, ty) !== Tile.Deepstone) continue;
      if (!open(tx - 1, ty) && !open(tx + 1, ty) && !open(tx, ty - 1) && !open(tx, ty + 1)) continue;
      if (cavernNoise(tx / strata.cavernScaleX, ty / strata.cavernScaleY) <= strata.cavernThreshold - 0.1) continue;
      if (rng() < spec.floatstoneChance) world.setTile(tx, ty, Tile.Floatstone);
    }
  }
}

/** The last row above the bedrock floor. */
function lowestRow(world: World): number {
  return world.height - BEDROCK_BOTTOM_ROWS - 1;
}

/** Is (tx, ty) inside the Heart of the Deep's cavern, or within `pad` tiles of it? */
function nearHeart(world: World, tx: number, ty: number, pad: number): boolean {
  const h = world.heart;
  return h !== null && tx >= h.cavernX0 - pad && tx <= h.cavernX1 + pad && ty >= h.cavernY0 - pad;
}

/**
 * The Heart of the Deep: a chamber of heartstone (spec.heartWall thick) standing on the floor
 * row above the bedrock, some way to one side of the spawn, with the Heart on its floor inside.
 * Around it a domed cavern is cleared, with a small lava pool in its floor on each side, so it's
 * a glowing landmark to find. Records it in world.heart.
 */
function placeHeart(world: World, rng: Rng, spec: DepthsGenSpec): void {
  const side = rng() < 0.5 ? -1 : 1;
  const cx = Math.floor(world.width / 2) + side * randInt(rng, spec.heartOffsetMin, spec.heartOffsetMax);
  const floor = lowestRow(world);
  const half = Math.floor(spec.heartWidth / 2);
  const x0 = cx - half;
  const x1 = cx + half;
  const y0 = floor - spec.heartHeight + 1;
  const t = spec.heartWall;
  // The cavern: a half-ellipse over the floor row, a little ragged at its edge.
  const rx = half + spec.heartCavernMargin;
  const ry = spec.heartCavernHeight;
  for (let ty = floor - ry; ty < floor; ty++) {
    for (let tx = cx - rx; tx <= cx + rx; tx++) {
      const d = ((tx - cx) / (rx + 0.5)) ** 2 + ((ty - floor) / (ry + 0.5)) ** 2;
      if (d > 1 || (d > 0.85 && rng() < 0.4)) continue;
      world.setTile(tx, ty, Tile.Air);
    }
  }
  for (let tx = cx - rx; tx <= cx + rx; tx++) world.setTile(tx, floor, Tile.Basalt);
  // A small lava pool in the floor on each side, with a rim of rock between it and the chamber.
  for (let k = 2; k <= spec.heartCavernMargin - 2; k++) {
    world.setTile(x0 - k, floor, Tile.Lava);
    world.setTile(x1 + k, floor, Tile.Lava);
  }
  // The chamber: a heartstone shell, open inside, with the Heart on its floor.
  for (let ty = y0; ty <= floor; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wall = tx < x0 + t || tx > x1 - t || ty < y0 + t || ty > floor - t;
      world.setTile(tx, ty, wall ? Tile.Heartstone : Tile.Air);
    }
  }
  world.setTile(cx, floor - t, Tile.HeartCore);
  world.heart = { tx: cx, ty: floor - t, x0, y0, x1, y1: floor, cavernX0: cx - rx, cavernX1: cx + rx, cavernY0: floor - ry };
}

/**
 * Hot rock: random-walk veins replacing the Magma Layer's basalt, below its gentle rows and away
 * from the Heart's cavern.
 */
function placeHotRock(world: World, rng: Rng, spec: DepthsGenSpec): void {
  const magma = world.strataTops[3];
  const top = Math.min(...magma) + spec.gentleRows;
  const bottom = lowestRow(world) - 1;
  if (bottom < top) return;
  const veins = Math.round(((bottom - top + 1) * world.width) / spec.hotRockTilesPerVein);
  for (let v = 0; v < veins; v++) {
    let tx = randInt(rng, 1, world.width - 2);
    let ty = randInt(rng, top, bottom);
    const size = randInt(rng, spec.hotRockVeinMin, spec.hotRockVeinMax);
    let placed = 0;
    for (let step = 0; step < size * 4 && placed < size; step++) {
      if (world.getTile(tx, ty) === Tile.Basalt && ty >= magma[tx] + spec.gentleRows && !nearHeart(world, tx, ty, 2)) {
        world.setTile(tx, ty, Tile.HotRock);
        placed++;
      }
      const dir = randInt(rng, 0, 3);
      tx = Math.min(world.width - 2, Math.max(1, tx + DX[dir]));
      ty = Math.min(bottom, Math.max(top, ty + DY[dir]));
    }
  }
}

/**
 * Lava pools in the Magma Layer's cave floors, below its gentle rows: a stretch of floor (rock
 * with open air above and rock below) long enough becomes a pool one tile deep, or two in its
 * middle, keeping a rim of rock at each end so the lava sits in a basin. Deeper floors get pools
 * more often. Only basalt and hot rock turn to lava (ore stays).
 */
function placeLavaPools(world: World, rng: Rng, spec: DepthsGenSpec): void {
  const magma = world.strataTops[3];
  const top = Math.min(...magma) + spec.gentleRows;
  const bottom = lowestRow(world) - 1;
  const rock = (tx: number, ty: number): boolean => {
    const tile = world.getTile(tx, ty);
    return tile === Tile.Basalt || tile === Tile.HotRock;
  };
  const firm = (tx: number, ty: number): boolean => isSolid(world.getTile(tx, ty)) && world.getTile(tx, ty) !== Tile.Bedrock;
  const floorAt = (tx: number, ty: number): boolean =>
    firm(tx, ty) && world.getTile(tx, ty - 1) === Tile.Air && isSolid(world.getTile(tx, ty + 1)) && ty >= magma[tx] + spec.gentleRows && !nearHeart(world, tx, ty, 2);
  for (let ty = top; ty <= bottom; ty++) {
    const depthT = (ty - top) / Math.max(1, bottom - top);
    const chance = spec.lavaPoolChance * (0.5 + 0.5 * depthT);
    let tx = 1;
    while (tx < world.width - 1) {
      if (!floorAt(tx, ty)) {
        tx++;
        continue;
      }
      const start = tx;
      while (tx < world.width - 1 && tx - start < spec.poolMaxRun && floorAt(tx, ty)) tx++;
      const end = tx - 1; // the run is start..end; its two ends stay rock
      if (end - start + 1 < spec.poolMinRun || rng() >= chance) continue;
      const deep = rng() < 0.5 && firm(start + 1, ty + 1) && firm(end - 1, ty + 1);
      for (let x = start + 1; x <= end - 1; x++) {
        if (rock(x, ty)) world.setTile(x, ty, Tile.Lava);
        if (deep && x >= start + 2 && x <= end - 2 && rock(x, ty + 1) && firm(x, ty + 2)) world.setTile(x, ty + 1, Tile.Lava);
      }
    }
  }
}
