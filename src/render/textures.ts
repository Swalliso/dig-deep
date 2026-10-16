import { BACKDROP_BRIGHTNESS, CRACK_STAGES, TEXTURE_SEED, TILE_SIZE } from '../config';
import { ITEM_IDS, itemDef } from '../systems/items';
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

function workbench(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Workbench).color);
  // Thick top board with a lighter top edge, two legs, and a cross brace.
  for (let y = 5; y < 9; y++) {
    for (let x = 0; x < S; x++) put(img, x, y, c, y === 5 ? 1.2 : y === 8 ? 0.7 : rng() < 0.15 ? 0.9 : 1);
  }
  for (let y = 9; y < S; y++) {
    for (const x of [1, 2, 13, 14]) put(img, x, y, c, x === 2 || x === 14 ? 0.75 : 0.9);
  }
  for (let x = 3; x < 13; x++) put(img, x, 12, c, 0.65);
  // A little saw resting on top.
  for (let x = 4; x < 10; x++) put(img, x, 4, [180, 184, 190]);
  put(img, 10, 4, [107, 74, 43]);
  put(img, 11, 4, [107, 74, 43]);
}

function furnace(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Furnace).color);
  speckle(img, rng, c);
  for (let x = 0; x < S; x++) {
    put(img, x, 0, c, 1.25);
    put(img, x, S - 1, c, 0.6);
  }
  // Arched opening with a fire glowing at the bottom.
  for (let y = 6; y < 14; y++) {
    for (let x = 4; x < 12; x++) {
      if (y === 6 && (x === 4 || x === 11)) continue;
      put(img, x, y, [24, 18, 16]);
    }
  }
  for (let x = 5; x < 11; x++) {
    put(img, x, 13, [255, 140, 40]);
    if (rng() < 0.6) put(img, x, 12, [255, 196, 80]);
  }
  for (let x = 3; x < 13; x++) put(img, x, 14, c, 0.7);
}

function chest(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Chest).color);
  const band: RGB = [70, 70, 78];
  const latch: RGB = [242, 201, 76];
  // A wooden box on the floor: lid (rows 4-7) over the body (rows 8-15), with dark iron bands.
  for (let y = 4; y < S; y++) {
    for (let x = 1; x < S - 1; x++) {
      const edge = x === 1 || x === S - 2 || y === S - 1;
      const shade = y === 4 ? 1.25 : y === 7 ? 0.62 : edge ? 0.72 : rng() < 0.15 ? 0.9 : 1;
      put(img, x, y, c, shade);
    }
  }
  for (let y = 4; y < S; y++) {
    put(img, 3, y, band);
    put(img, S - 4, y, band, 0.85);
  }
  // Latch on the seam between lid and body.
  for (let y = 6; y < 10; y++) {
    put(img, 7, y, latch, y === 6 ? 1.1 : 1);
    put(img, 8, y, latch, 0.8);
  }
  put(img, 7, 8, [60, 46, 20]);
}

/** Two rails with four rungs; see-through between them. */
function ladder(img: ImageData): void {
  const c = rgb(tileDef(Tile.Ladder).color);
  for (let y = 0; y < S; y++) {
    put(img, 2, y, c, 1.1);
    put(img, 3, y, c, 0.75);
    put(img, 12, y, c, 1.1);
    put(img, 13, y, c, 0.75);
  }
  for (const y of [1, 5, 9, 13]) {
    for (let x = 4; x < 12; x++) {
      put(img, x, y, c, 1.15);
      put(img, x, y + 1, c, 0.7);
    }
  }
}

/** A thin plank along the top of the tile, held by two small brackets. */
function platform(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Platform).color);
  for (let x = 0; x < S; x++) {
    put(img, x, 0, c, 1.22);
    put(img, x, 1, c, rng() < 0.2 ? 0.9 : 1);
    put(img, x, 2, c, rng() < 0.2 ? 0.9 : 1);
    put(img, x, 3, c, 0.66);
  }
  put(img, 7, 1, c, 0.75); // seam between two boards
  put(img, 7, 2, c, 0.75);
  for (const x of [2, 13]) {
    put(img, x, 4, c, 0.6);
    put(img, x, 5, c, 0.5);
  }
}

/**
 * One half of a closed door: vertical boards in a frame. The door is 12 px wide (x 2..13) and
 * two tiles tall, so the top half has the top rail and the bottom half the handle and bottom rail.
 */
function doorClosed(img: ImageData, rng: Rng, top: boolean): void {
  const c = rgb(tileDef(Tile.DoorClosedTop).color);
  for (let y = 0; y < S; y++) {
    for (let x = 2; x < 14; x++) {
      const frame = x === 2 || x === 13 || (top && y === 0) || (!top && y === S - 1);
      const seam = x === 6 || x === 10;
      put(img, x, y, c, frame ? 0.62 : seam ? 0.78 : rng() < 0.12 ? 0.9 : x === 3 ? 1.15 : 1);
    }
  }
  // A cross rail near the middle of the door (bottom of the top half, top of the bottom half).
  for (let x = 3; x < 13; x++) put(img, x, top ? S - 2 : 1, c, 0.7);
  if (!top) {
    put(img, 11, 4, [242, 201, 76]);
    put(img, 11, 5, [160, 120, 40]);
  }
}

/** One half of an open door: just its edge, swung against the left of the frame. */
function doorOpen(img: ImageData, top: boolean): void {
  const c = rgb(tileDef(Tile.DoorOpenTop).color);
  for (let y = 0; y < S; y++) {
    const end = (top && y === 0) || (!top && y === S - 1);
    put(img, 2, y, c, 0.62);
    put(img, 3, y, c, end ? 0.62 : 1.1);
    put(img, 4, y, c, end ? 0.62 : 0.8);
  }
}

const BED_WOOD: RGB = [122, 82, 48];
const SHEET: RGB = [232, 228, 218];

/**
 * One half of a bed, which is two tiles wide and stands on the floor: a wooden frame with a
 * headboard on the left half (with the pillow) and a footboard on the right (under the blanket).
 */
function bed(img: ImageData, rng: Rng, left: boolean): void {
  const blanket = rgb(tileDef(Tile.BedLeft).color);
  const post = left ? 1 : 13;
  for (let y = left ? 3 : 7; y < S; y++) {
    put(img, post, y, BED_WOOD, 1.1);
    put(img, post + 1, y, BED_WOOD, 0.8);
  }
  for (let x = 0; x < S; x++) {
    if (x === post || x === post + 1) continue;
    put(img, x, 12, BED_WOOD, 1);
    put(img, x, 13, BED_WOOD, 0.75);
  }
  // Mattress, then the blanket over it from the middle of the left half to the footboard.
  for (let x = left ? 3 : 0; x < (left ? S : 13); x++) {
    for (let y = 9; y < 12; y++) put(img, x, y, SHEET, y === 11 ? 0.85 : 1);
    if (!left || x >= 9) {
      for (let y = 8; y < 12; y++) put(img, x, y, blanket, y === 8 ? 1.2 : rng() < 0.1 ? 0.9 : 1);
    }
  }
  if (left) {
    for (let x = 3; x < 8; x++) for (let y = 6; y < 9; y++) put(img, x, y, SHEET, y === 6 ? 1.05 : y === 8 ? 0.8 : 0.95);
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
    case Tile.Workbench: return workbench(img, rng);
    case Tile.Furnace: return furnace(img, rng);
    case Tile.Chest: return chest(img, rng);
    case Tile.Ladder: return ladder(img);
    case Tile.Platform: return platform(img, rng);
    case Tile.DoorClosedTop: return doorClosed(img, rng, true);
    case Tile.DoorClosedBottom: return doorClosed(img, rng, false);
    case Tile.DoorOpenTop: return doorOpen(img, true);
    case Tile.DoorOpenBottom: return doorOpen(img, false);
    case Tile.BedLeft: return bed(img, rng, true);
    case Tile.BedRight: return bed(img, rng, false);
  }
}

/** Ingot: a lighter top face over a darker body. */
function barIcon(img: ImageData, color: string): void {
  const c = rgb(color);
  for (let x = 4; x < 12; x++) put(img, x, 6, c, 1.35);
  for (let y = 7; y < 11; y++) for (let x = 3; x < 13; x++) put(img, x, y, c, x === 3 || x === 12 ? 0.8 : 1.05);
  for (let x = 2; x < 14; x++) put(img, x, 11, c, 0.65);
  put(img, 5, 6, c, 1.6);
  put(img, 6, 6, c, 1.6);
}

/** Pickaxe: a wooden handle running up and right, with a curved head across its top. */
function pickaxeIcon(img: ImageData, color: string): void {
  const handle: RGB = [107, 74, 43];
  for (let i = 0; i < 9; i++) {
    put(img, 3 + i, 13 - i, handle);
    put(img, 4 + i, 13 - i, handle, 0.75);
  }
  const c = rgb(color);
  const head: [number, number][] = [
    [5, 2], [6, 2], [7, 2], [8, 3], [9, 3], [10, 4], [11, 5], [12, 6], [12, 7], [13, 8], [13, 9], [13, 10],
  ];
  for (const [x, y] of head) {
    put(img, x, y, c, 1.15);
    put(img, x, y + 1, c, 0.8);
  }
  put(img, 4, 3, c, 0.9);
  put(img, 14, 11, c, 0.9);
}

/** A whole closed door, shrunk to fit one icon: boards in a frame, with a handle. */
function doorIcon(img: ImageData, color: string): void {
  const c = rgb(color);
  for (let y = 1; y < S; y++) {
    for (let x = 4; x < 12; x++) {
      const frame = x === 4 || x === 11 || y === 1 || y === S - 1;
      put(img, x, y, c, frame ? 0.62 : x === 7 ? 0.78 : x === 5 ? 1.15 : 1);
    }
  }
  for (let x = 5; x < 11; x++) put(img, x, 8, c, 0.7);
  put(img, 10, 9, [242, 201, 76]);
}

/** A whole bed, shrunk to fit one icon: headboard, pillow and blanket. */
function bedIcon(img: ImageData, color: string): void {
  const c = rgb(color);
  for (let y = 5; y < 14; y++) put(img, 1, y, BED_WOOD, 1.1);
  for (let y = 8; y < 14; y++) put(img, 14, y, BED_WOOD, 1.1);
  for (let x = 2; x < 14; x++) {
    put(img, x, 11, BED_WOOD);
    put(img, x, 9, SHEET, 0.9);
    put(img, x, 10, SHEET, 0.8);
  }
  for (let x = 2; x < 5; x++) put(img, x, 8, SHEET);
  for (let x = 6; x < 14; x++) {
    put(img, x, 8, c, 1.2);
    put(img, x, 9, c);
    put(img, x, 10, c, 0.85);
  }
}

/** Item icons: ITEM_IDS[i] lives at x = i * TILE_SIZE. Tile items reuse their tile texture. */
export function buildItemAtlas(tileAtlas: HTMLCanvasElement): HTMLCanvasElement {
  const atlas = document.createElement('canvas');
  atlas.width = ITEM_IDS.length * S;
  atlas.height = S;
  const ctx = atlas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  ITEM_IDS.forEach((id, i) => {
    const icon = itemDef(id).icon;
    if (typeof icon === 'number') {
      ctx.drawImage(tileAtlas, icon * S, 0, S, S, i * S, 0, S, S);
      return;
    }
    const img = new ImageData(S, S);
    if (icon.shape === 'bar') barIcon(img, icon.color);
    else if (icon.shape === 'door') doorIcon(img, icon.color);
    else if (icon.shape === 'bed') bedIcon(img, icon.color);
    else pickaxeIcon(img, icon.color);
    ctx.putImageData(img, i * S, 0);
  });
  return atlas;
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

/** Underground backdrop: the dirt texture, darkened. Tiled behind dug-out spaces. */
export function buildBackdropTile(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  const img = new ImageData(S, S);
  dirt(img, createRng(TEXTURE_SEED + 100));
  for (let i = 0; i < img.data.length; i += 4) {
    for (let c = 0; c < 3; c++) img.data[i + c] *= BACKDROP_BRIGHTNESS;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
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
