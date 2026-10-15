import { CRACK_STAGES, TEXTURE_SEED, TILE_SIZE } from '../config';
import { createRng, randInt, type Rng } from '../util/rng';
import { Tile, TILE_COUNT, tileDef } from '../world/tiles';

// Procedural 16x16 tile textures, generated once at startup into one atlas canvas.
// Tile id N lives at x = N * TILE_SIZE, y = 0.

type RGB = [number, number, number];

const S = TILE_SIZE;

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function put(img: ImageData, x: number, y: number, c: RGB, shade = 1): void {
  const i = (y * S + x) * 4;
  img.data[i] = c[0] * shade;
  img.data[i + 1] = c[1] * shade;
  img.data[i + 2] = c[2] * shade;
  img.data[i + 3] = 255;
}

function erase(img: ImageData, x: number, y: number): void {
  img.data[(y * S + x) * 4 + 3] = 0;
}

/** Base color with a sprinkling of darker and lighter pixels. */
function speckle(img: ImageData, rng: Rng, c: RGB, strength = 1): void {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = rng();
      const shade = r < 0.15 ? 0.82 : r < 0.3 ? 1.14 : r < 0.5 ? 0.93 : 1;
      put(img, x, y, c, 1 + (shade - 1) * strength);
    }
  }
}

function stone(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Stone).color);
  speckle(img, rng, c);
  // A few short dark cracks.
  for (let k = 0; k < 3; k++) {
    let x = randInt(rng, 1, S - 2);
    let y = randInt(rng, 1, S - 2);
    for (let i = 0; i < 3; i++) {
      put(img, x, y, c, 0.7);
      x = Math.min(S - 1, x + randInt(rng, 0, 1));
      y = Math.min(S - 1, y + 1);
    }
  }
}

function dirt(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Dirt).color);
  speckle(img, rng, c);
  for (let k = 0; k < 4; k++) put(img, randInt(rng, 0, S - 1), randInt(rng, 0, S - 1), [150, 130, 110]);
}

function grass(img: ImageData, rng: Rng): void {
  dirt(img, rng);
  const g = rgb(tileDef(Tile.Grass).color);
  for (let x = 0; x < S; x++) {
    const depth = 3 + (rng() < 0.5 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
    for (let y = 0; y < depth; y++) put(img, x, y, g, y === 0 ? 1.15 : rng() < 0.3 ? 0.85 : 1);
  }
}

function ore(img: ImageData, rng: Rng, color: string): void {
  stone(img, rng);
  const c = rgb(color);
  for (let k = 0; k < 6; k++) {
    const x = randInt(rng, 1, S - 3);
    const y = randInt(rng, 1, S - 3);
    put(img, x, y, c, 1.25);
    put(img, x + 1, y, c);
    put(img, x, y + 1, c, 0.85);
    if (rng() < 0.6) put(img, x + 1, y + 1, c, 0.75);
  }
}

function wood(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Wood).color);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const bark = x % 4 === 0 ? 0.72 : x % 4 === 2 ? 0.9 : 1;
      put(img, x, y, c, bark * (rng() < 0.12 ? 0.88 : 1));
    }
  }
  for (let y = 0; y < S; y++) {
    put(img, 0, y, c, 0.6);
    put(img, S - 1, y, c, 0.6);
  }
}

function leaves(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Leaves).color);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = rng();
      if (r < 0.08) erase(img, x, y);
      else put(img, x, y, c, r < 0.3 ? 0.78 : r < 0.42 ? 1.25 : 1);
    }
  }
}

function deepstone(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Deepstone).color);
  speckle(img, rng, c, 1.3);
  for (let k = 0; k < 5; k++) put(img, randInt(rng, 0, S - 1), randInt(rng, 0, S - 1), [96, 108, 140]);
}

function bedrock(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Bedrock).color);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = rng();
      put(img, x, y, c, r < 0.25 ? 0.6 : r < 0.5 ? 1.6 : r < 0.6 ? 2.3 : 1);
    }
  }
}

function torch(img: ImageData): void {
  const stick: RGB = [107, 74, 43];
  const flame = rgb(tileDef(Tile.Torch).color);
  for (let y = 7; y < S; y++) {
    put(img, 7, y, stick);
    put(img, 8, y, stick, 0.8);
  }
  for (let y = 4; y < 7; y++) {
    put(img, 7, y, flame);
    put(img, 8, y, flame, 0.9);
  }
  put(img, 7, 3, flame, 0.9);
  put(img, 7, 5, [255, 243, 160]);
  put(img, 8, 5, [255, 243, 160]);
}

function planks(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Planks).color);
  speckle(img, rng, c, 0.5);
  for (let board = 0; board < 4; board++) {
    const bottom = board * 4 + 3;
    for (let x = 0; x < S; x++) put(img, x, bottom, c, 0.68);
    const seam = board % 2 === 0 ? 5 : 11;
    for (let y = board * 4; y < bottom; y++) put(img, seam, y, c, 0.75);
  }
}

function drawTile(img: ImageData, id: number, rng: Rng): void {
  switch (id) {
    case Tile.Grass: return grass(img, rng);
    case Tile.Dirt: return dirt(img, rng);
    case Tile.Stone: return stone(img, rng);
    case Tile.Wood: return wood(img, rng);
    case Tile.Leaves: return leaves(img, rng);
    case Tile.CoalOre:
    case Tile.CopperOre:
    case Tile.IronOre:
    case Tile.GoldOre: return ore(img, rng, tileDef(id).color);
    case Tile.Deepstone: return deepstone(img, rng);
    case Tile.Bedrock: return bedrock(img, rng);
    case Tile.Torch: return torch(img);
    case Tile.Planks: return planks(img, rng);
  }
}

/**
 * Crack overlays for mining progress: CRACK_STAGES frames side by side, each one adding more
 * cracks to the last. Transparent except for the dark crack pixels.
 */
export function buildCrackAtlas(): HTMLCanvasElement {
  const atlas = document.createElement('canvas');
  atlas.width = CRACK_STAGES * S;
  atlas.height = S;
  const ctx = atlas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  const rng = createRng(TEXTURE_SEED);
  const img = new ImageData(S, S);
  const dark: RGB = [20, 16, 14];
  for (let stage = 0; stage < CRACK_STAGES; stage++) {
    // Each stage grows two more crack lines out from near the centre.
    for (let line = 0; line < 2; line++) {
      let x = randInt(rng, 5, 10);
      let y = randInt(rng, 5, 10);
      const dx = rng() < 0.5 ? -1 : 1;
      const dy = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < 3 + stage * 2; i++) {
        put(img, x, y, dark);
        if (rng() < 0.6) x += dx;
        if (rng() < 0.6) y += dy;
        x = Math.min(S - 1, Math.max(0, x));
        y = Math.min(S - 1, Math.max(0, y));
      }
    }
    ctx.putImageData(img, stage * S, 0);
  }
  return atlas;
}

export function buildTileAtlas(): HTMLCanvasElement {
  const atlas = document.createElement('canvas');
  atlas.width = TILE_COUNT * S;
  atlas.height = S;
  const ctx = atlas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  for (let id = 1; id < TILE_COUNT; id++) {
    const img = new ImageData(S, S);
    drawTile(img, id, createRng(TEXTURE_SEED + id));
    ctx.putImageData(img, id * S, 0);
  }
  return atlas;
}
