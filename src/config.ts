// Every tunable number in the game lives here.

// --- Tiles and world size ---
export const TILE_SIZE = 16; // px
export const WORLD_WIDTH = 1000; // tiles
export const WORLD_HEIGHT = 600; // tiles
export const CHUNK_SIZE = 32; // tiles per chunk side

// --- Loop ---
export const UPDATE_HZ = 60;
export const MAX_FRAME_TIME = 0.25; // s; longer frames are clamped so the sim doesn't spiral

// --- Rendering ---
// Pixel scale is 3x when the canvas is at least this many device pixels tall, else 2x.
export const SCALE_3X_MIN_HEIGHT = 1000;
export const SKY_TOP_COLOR = '#5fa8e8';
export const SKY_BOTTOM_COLOR = '#bfe3ff';
export const CHUNK_CACHE_LIMIT = 48; // cached chunk canvases kept in memory (~1 MB each)
export const TEXTURE_SEED = 1337; // fixed so tile textures look the same in every world

// --- Free-fly camera (Phase 1 debug camera) ---
export const CAMERA_FLY_SPEED = 600; // px/s
export const CAMERA_FAST_MULTIPLIER = 4; // while Shift is held

// --- World generation ---
// Average surface row. Depth (in m) = ty - SURFACE_LEVEL, so the depth meter reads 0 here.
export const SURFACE_LEVEL = 120;
export const SURFACE_AMPLITUDE = 25; // surface varies +/- this many tiles
export const SURFACE_NOISE_SCALES = [180, 70, 25]; // tiles per noise period, per octave
export const SURFACE_NOISE_WEIGHTS = [0.65, 0.27, 0.08];

export const DIRT_DEPTH_MIN = 10;
export const DIRT_DEPTH_MAX = 18;
export const DIRT_NOISE_SCALE = 40;

export const DEEPSTONE_ROW = 350; // absolute row where deepstone begins
export const DEEPSTONE_JITTER = 8; // +/- tiles of noise on that boundary
export const DEEPSTONE_NOISE_SCALE = 30;

export const CAVE_NOISE_SCALE_X = 48;
export const CAVE_NOISE_SCALE_Y = 28;
export const CAVE_DETAIL_SCALE = 0.4; // second octave scale, relative to the first
export const CAVE_DETAIL_WEIGHT = 0.3; // second octave share of the cave noise
export const CAVE_THRESHOLD_SHALLOW = 0.55; // noise must exceed this to carve near the surface
export const CAVE_THRESHOLD_DEEP = 0.28; // ...and this at the bottom of the world
export const CAVE_SOLID_CRUST = 8; // tiles under the surface that stay mostly solid
export const CAVE_CRUST_HARD = 3; // top tiles of the crust that are never carved
export const CAVE_CRUST_PENALTY = 0.45; // extra threshold at the top of the crust, fading out

export const BEDROCK_BOTTOM_ROWS = 3;

export const TREE_SPACING_MIN = 6;
export const TREE_SPACING_MAX = 15;
export const TREE_TRUNK_MIN = 4;
export const TREE_TRUNK_MAX = 7;
export const TREE_EDGE_MARGIN = 4; // no trees this close to the world edges
export const TREE_LEAF_RAGGEDNESS = 0.3; // chance each edge leaf of the blob is left out

export interface OreSpec {
  minDepth: number; // m below SURFACE_LEVEL
  maxDepth: number;
  tilesPerVein: number; // one vein per this many tiles of the depth band
  veinMin: number;
  veinMax: number;
}

export const ORE_COAL: OreSpec = { minDepth: 20, maxDepth: 200, tilesPerVein: 500, veinMin: 3, veinMax: 8 };
export const ORE_COPPER: OreSpec = { minDepth: 30, maxDepth: 250, tilesPerVein: 700, veinMin: 3, veinMax: 8 };
export const ORE_IRON: OreSpec = { minDepth: 120, maxDepth: 400, tilesPerVein: 900, veinMin: 3, veinMax: 8 };
export const ORE_GOLD: OreSpec = { minDepth: 250, maxDepth: 550, tilesPerVein: 1300, veinMin: 3, veinMax: 8 };

// Generation runs in slices across frames so the loading screen can show progress.
export const GEN_FRAME_BUDGET_MS = 12;
