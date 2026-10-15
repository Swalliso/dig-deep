import { createNoise2D } from 'simplex-noise';
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
  DIRT_DEPTH_MAX,
  DIRT_DEPTH_MIN,
  DIRT_NOISE_SCALE,
  ORE_COAL,
  ORE_COPPER,
  ORE_GOLD,
  ORE_IRON,
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
  type OreSpec,
} from '../config';
import { createRng, randInt, type Rng } from '../util/rng';
import { Tile, tileDef, type TileId } from './tiles';
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

const STEP_COUNT = 7;
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

/** Generate a whole world in one go (tests, and anywhere a loading screen isn't needed). */
export function generateWorld(seed: number): World {
  const world = new World(WORLD_WIDTH, WORLD_HEIGHT, seed);
  const steps = generateWorldSteps(world);
  while (!steps.next().done) {
    // run every step
  }
  return world;
}

/**
 * Fill an empty world from its seed. Yields progress often so the caller can spread the work
 * over several frames. All randomness comes from RNGs derived from the seed.
 */
export function* generateWorldSteps(world: World): Generator<GenProgress, void, void> {
  const seed = world.seed;
  const subRng = (salt: number): Rng => createRng((seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0);
  const progress = (step: number, label: string): GenProgress => ({ label, progress: step / STEP_COUNT });
  const { width, height } = world;

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

  // 2. Layers: grass, a noisy band of dirt, stone, then deepstone below a noisy boundary.
  yield progress(1, 'Layering dirt and stone');
  const dirtNoise = createNoise2D(subRng(2));
  const deepNoise = createNoise2D(subRng(3));
  for (let tx = 0; tx < width; tx++) {
    const s = world.surface[tx];
    const dirtT = (dirtNoise(tx / DIRT_NOISE_SCALE, 0) + 1) / 2;
    const dirtDepth = Math.round(DIRT_DEPTH_MIN + dirtT * (DIRT_DEPTH_MAX - DIRT_DEPTH_MIN));
    const deepRow = DEEPSTONE_ROW + Math.round(deepNoise(tx / DEEPSTONE_NOISE_SCALE, 0) * DEEPSTONE_JITTER);
    world.setTile(tx, s, Tile.Grass);
    for (let ty = s + 1; ty < height; ty++) {
      world.setTile(tx, ty, ty <= s + dirtDepth ? Tile.Dirt : ty >= deepRow ? Tile.Deepstone : Tile.Stone);
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

  // 4. Ores: random-walk veins, only into stone/deepstone, only inside each ore's depth band.
  const oreRng = subRng(5);
  for (let i = 0; i < ORE_LAYERS.length; i++) {
    yield progress(3 + i / ORE_LAYERS.length, 'Placing ores');
    placeOreVeins(world, oreRng, ORE_LAYERS[i].tile, ORE_LAYERS[i].spec);
  }

  // 5. Trees on flat stretches of grass.
  yield progress(4, 'Growing trees');
  placeTrees(world, subRng(6));

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

  yield progress(STEP_COUNT, 'Done');
}

/** Absolute rows [top, bottom] an ore may occupy, clipped to above the bedrock floor. */
export function oreRowRange(world: World, spec: OreSpec): [number, number] {
  const top = SURFACE_LEVEL + spec.minDepth;
  const bottom = Math.min(SURFACE_LEVEL + spec.maxDepth, world.height - 1 - BEDROCK_BOTTOM_ROWS);
  return [top, bottom];
}

function placeOreVeins(world: World, rng: Rng, tile: TileId, spec: OreSpec): void {
  const [top, bottom] = oreRowRange(world, spec);
  if (bottom < top) return;
  const veins = Math.round(((bottom - top + 1) * world.width) / spec.tilesPerVein);
  for (let v = 0; v < veins; v++) {
    let tx = randInt(rng, 1, world.width - 2);
    let ty = randInt(rng, top, bottom);
    const size = randInt(rng, spec.veinMin, spec.veinMax);
    let placed = 0;
    for (let step = 0; step < size * 4 && placed < size; step++) {
      const current = world.getTile(tx, ty);
      if (current === Tile.Stone || current === Tile.Deepstone) {
        world.setTile(tx, ty, tile);
        placed++;
      }
      const dir = randInt(rng, 0, 3);
      tx = Math.min(world.width - 2, Math.max(1, tx + DX[dir]));
      ty = Math.min(bottom, Math.max(top, ty + DY[dir]));
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
