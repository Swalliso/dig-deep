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

/** Mudstone: damp olive rock with darker wet streaks and flecks of moss. */
function mudstone(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Mudstone).color);
  speckle(img, rng, c, 1.1);
  // Layered streaks along the bedding.
  for (let k = 0; k < 3; k++) {
    const y = randInt(rng, 1, S - 2);
    const x0 = randInt(rng, 0, 7);
    for (let x = x0; x < Math.min(S, x0 + randInt(rng, 5, 10)); x++) put(img, x, y, c, 0.74);
  }
  for (let k = 0; k < 4; k++) put(img, randInt(rng, 0, S - 1), randInt(rng, 0, S - 1), [96, 138, 78]);
}

/**
 * Basalt: near-black rock with a reddish cast, coarse grain and a few short cracks that run
 * mostly up and down. Nothing crosses the whole tile, so a wall of it doesn't read as bricks.
 */
function basalt(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Basalt).color);
  speckle(img, rng, c, 1.4);
  for (let k = 0; k < 3; k++) {
    let x = randInt(rng, 1, S - 2);
    let y = randInt(rng, 0, S - 5);
    for (let i = 0; i < randInt(rng, 3, 5); i++) {
      put(img, x, y, c, 0.62);
      if (rng() < 0.3) x = Math.min(S - 1, Math.max(0, x + (rng() < 0.5 ? -1 : 1)));
      y = Math.min(S - 1, y + 1);
    }
  }
  for (let k = 0; k < 4; k++) put(img, randInt(rng, 0, S - 1), randInt(rng, 0, S - 1), [112, 60, 50]);
}

/** Bricks: rows of blocks in running bond, light top edges and dark mortar, in the rock's colour. */
function bricks(img: ImageData, rng: Rng, color: string): void {
  const c = rgb(color);
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / 4);
    const offset = row % 2 === 0 ? 0 : 4;
    for (let x = 0; x < S; x++) {
      const mortar = y % 4 === 3 || (x + offset) % 8 === 7;
      const top = y % 4 === 0;
      put(img, x, y, c, mortar ? 0.55 : top ? 1.18 : rng() < 0.18 ? 0.92 : 1);
    }
  }
}

/** A gem in rock: a few faceted crystals, each with a bright face and a dark one. */
function gemOre(img: ImageData, rng: Rng, color: string): void {
  deepstone(img, rng);
  const c = rgb(color);
  for (const [cx, cy] of [[4, 4], [11, 6], [6, 11], [12, 12]] as [number, number][]) {
    const x = cx + randInt(rng, -1, 1);
    const y = cy + randInt(rng, -1, 1);
    put(img, x, y - 1, c, 1.45);
    put(img, x - 1, y, c, 1.2);
    put(img, x, y, c, 1);
    put(img, x + 1, y, c, 0.75);
    put(img, x, y + 1, c, 0.6);
  }
}

/** Emberite: glowing orange veins and blobs running through basalt. */
function emberiteOre(img: ImageData, rng: Rng): void {
  basalt(img, rng);
  const c = rgb(tileDef(Tile.EmberiteOre).color);
  for (let k = 0; k < 3; k++) {
    let x = randInt(rng, 1, S - 2);
    let y = randInt(rng, 1, S - 2);
    for (let i = 0; i < 5; i++) {
      put(img, x, y, c, i === 2 ? 1.3 : 1);
      x = Math.min(S - 1, Math.max(0, x + randInt(rng, -1, 1)));
      y = Math.min(S - 1, Math.max(0, y + 1));
    }
  }
  for (let k = 0; k < 3; k++) put(img, randInt(rng, 2, S - 3), randInt(rng, 2, S - 3), [255, 220, 120]);
}

/** A giant mushroom's stem: pale, with soft vertical fibres and darker edges. */
function mushroomStem(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.MushroomStem).color);
  for (let y = 0; y < S; y++) {
    for (let x = 3; x < 13; x++) {
      const edge = x === 3 || x === 12 ? 0.7 : x === 4 ? 1.12 : (x * 5 + y) % 7 === 0 ? 0.9 : 1;
      put(img, x, y, c, edge * (rng() < 0.1 ? 0.92 : 1));
    }
  }
}

/** A giant mushroom's cap: smooth purple, lighter at the top, darker toward the gills, with pale spots. */
function mushroomCap(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.MushroomCap).color);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) put(img, x, y, c, 1.12 - y * 0.018 - (rng() < 0.12 ? 0.07 : 0));
  }
  for (let x = 0; x < S; x++) put(img, x, S - 1, c, 0.7);
  for (const [x, y] of [[3, 3], [10, 2], [7, 8], [13, 10]] as [number, number][]) {
    put(img, x, y, [236, 220, 240]);
    put(img, x + 1, y, [236, 220, 240], 0.92);
    put(img, x, y + 1, [236, 220, 240], 0.85);
    put(img, x + 1, y + 1, [236, 220, 240], 0.8);
  }
}

/** A sapling: a thin stem with a few small leaves. */
function sapling(img: ImageData): void {
  const stem: RGB = [107, 74, 43];
  const leaf = rgb(tileDef(Tile.Sapling).color);
  for (let y = 7; y < S; y++) put(img, 8, y, stem, y === S - 1 ? 0.8 : 1);
  for (const [x, y, s] of [[6, 7, 1], [7, 6, 1.15], [9, 5, 1], [10, 6, 0.85], [7, 9, 1], [6, 10, 0.85], [9, 10, 1.1], [10, 9, 1], [8, 4, 1.2]] as [number, number, number][]) {
    put(img, x, y, leaf, s);
  }
}

/** A mushroom sprout: a tiny pale stalk with a small purple cap. */
function mushroomSprout(img: ImageData): void {
  const stem: RGB = [214, 202, 176];
  const cap = rgb(tileDef(Tile.MushroomCap).color);
  for (let y = 11; y < S; y++) put(img, 8, y, stem, y === S - 1 ? 0.8 : 1);
  for (let x = 6; x <= 10; x++) put(img, x, 10, cap, 0.85);
  for (let x = 7; x <= 9; x++) put(img, x, 9, cap, 1.1);
  put(img, 7, 9, [236, 220, 240]);
  for (let y = 13; y < S; y++) put(img, 4, y, stem, 0.9);
  put(img, 3, 12, cap);
  put(img, 4, 12, cap, 1.1);
  put(img, 5, 12, cap, 0.85);
}

/** A gem lamp: a gold bracket holding a glowing gem. */
function gemLamp(img: ImageData, color: string): void {
  const gold: RGB = [242, 201, 76];
  const c = rgb(color);
  for (let y = 9; y < S; y++) put(img, 8, y, gold, y % 3 === 0 ? 0.8 : 1);
  for (let x = 6; x <= 10; x++) put(img, x, 9, gold, 0.85);
  for (let y = 3; y < 9; y++) {
    const half = y < 5 ? y - 3 : y > 6 ? 8 - y : 2;
    for (let x = 8 - half; x <= 8 + half; x++) put(img, x, y, c, x < 8 ? 1.3 : x > 8 ? 0.8 : 1.05);
  }
  put(img, 7, 4, [255, 255, 255]);
}

/** Lava: bright orange with yellow-hot streaks and a few darker cooling crusts. */
function lava(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Lava).color);
  const hot: RGB = [255, 214, 92];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const wave = Math.sin((x + y * 0.5) * 0.9) + Math.sin((x * 0.4 - y) * 0.7);
      put(img, x, y, wave > 1.2 ? hot : c, wave > 1.2 ? 1 : wave < -1.1 ? 0.72 : rng() < 0.15 ? 0.9 : 1);
    }
  }
  for (let k = 0; k < 3; k++) {
    const x = randInt(rng, 1, S - 4);
    const y = randInt(rng, 2, S - 2);
    for (let i = 0; i < 3; i++) put(img, x + i, y, [120, 40, 20]);
  }
}

/** Hot rock: basalt split by glowing red-orange cracks. */
function hotRock(img: ImageData, rng: Rng): void {
  basalt(img, rng);
  const glow = rgb(tileDef(Tile.HotRock).glowColor ?? '#ff4a1a');
  for (let k = 0; k < 3; k++) {
    let x = randInt(rng, 1, S - 2);
    let y = randInt(rng, 0, 4);
    for (let i = 0; i < 9 && y < S; i++) {
      put(img, x, y, glow, i % 3 === 1 ? 1.15 : 0.95);
      x = Math.min(S - 1, Math.max(0, x + randInt(rng, -1, 1)));
      y += rng() < 0.75 ? 1 : 0;
    }
  }
}

/** Floatstone: pale blue crystal blocks drifting apart, with dark gaps between them. */
function floatstone(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Floatstone).color);
  const gap: RGB = [40, 52, 70];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, gap, rng() < 0.2 ? 1.2 : 1);
  for (const [x0, y0, w, h] of [[1, 2, 6, 5], [9, 0, 6, 6], [3, 9, 5, 6], [10, 8, 5, 5]] as [number, number, number, number][]) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) put(img, x, y, c, y === y0 ? 1.2 : x === x0 + w - 1 || y === y0 + h - 1 ? 0.75 : 1);
    }
    put(img, x0 + 1, y0 + 1, [255, 255, 255]);
  }
}

/** Heartstone: deep crimson rock laced with bright veins that meet in diamonds. */
function heartstone(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Heartstone).color);
  const vein: RGB = [232, 54, 86];
  speckle(img, rng, c, 1.2);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if ((x + y) % 8 === 0 || (x - y + 16) % 8 === 4) put(img, x, y, vein, (x * 3 + y) % 5 === 0 ? 1.25 : 0.9);
    }
  }
}

/** The Heart of the Deep: a big faceted red gem with a golden glow at its core. */
function heartCore(img: ImageData): void {
  const c = rgb(tileDef(Tile.HeartCore).color);
  const gold: RGB = [255, 214, 120];
  for (let y = 1; y < S - 1; y++) {
    const half = y < 6 ? Math.min(y + 1, 6) : Math.max(0, 14 - y);
    for (let x = 8 - half; x < 8 + half; x++) {
      const core = Math.abs(x - 7.5) + Math.abs(y - 7) < 3;
      put(img, x, y, core ? gold : c, core ? 1 : x < 8 ? 1.2 : 0.8);
    }
  }
  put(img, 5, 3, [255, 255, 255]);
  put(img, 6, 2, [255, 255, 255]);
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

/** Two glowing mushrooms growing from the floor: pale stems, bright speckled caps. */
function glowshroom(img: ImageData): void {
  const cap = rgb(tileDef(Tile.Glowshroom).color);
  const stem: RGB = [214, 236, 226];
  const mushroom = (cx: number, top: number, width: number): void => {
    for (let y = top + 2; y < S; y++) put(img, cx, y, stem, y === S - 1 ? 0.8 : 1);
    for (let x = cx - width; x <= cx + width; x++) put(img, x, top + 1, cap, 0.85);
    for (let x = cx - width + 1; x <= cx + width - 1; x++) put(img, x, top, cap, 1.1);
    put(img, cx - 1, top, [230, 255, 250]);
    put(img, cx + width - 1, top + 1, [230, 255, 250]);
  };
  mushroom(5, 7, 3);
  mushroom(11, 10, 2);
}

/** Rock with glowing crystal shards growing out of it. */
function glowCrystal(img: ImageData, rng: Rng): void {
  stone(img, rng);
  const c = rgb(tileDef(Tile.GlowCrystal).color);
  const shard = (x0: number, bottom: number, height: number): void => {
    for (let i = 0; i < height; i++) {
      const y = bottom - i;
      put(img, x0, y, c, 1.25);
      put(img, x0 + 1, y, c, 0.85);
      if (i < height - 2) put(img, x0 - 1, y, c, 0.7);
    }
    put(img, x0, bottom - height + 1, [245, 230, 255]);
  };
  shard(4, 14, 9);
  shard(8, 13, 11);
  shard(12, 14, 7);
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

/**
 * Gravel: rounded pebbles of several shades, each with a light top and a dark edge, packed with
 * dark gaps between them. Lighter and lumpier than stone, so loose ground reads at a glance.
 */
function gravel(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Gravel).color);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, c, 0.45 + rng() * 0.08);
  // Pebbles on a jittered 4 px grid, each 3 or 4 px across with clipped corners.
  for (let gy = 0; gy < S; gy += 4) {
    for (let gx = 0; gx < S; gx += 4) {
      const size = rng() < 0.5 ? 3 : 4;
      const ox = gx + randInt(rng, 0, 4 - size + (size === 3 ? 1 : 0));
      const oy = gy + randInt(rng, 0, 4 - size + (size === 3 ? 1 : 0));
      const tone = 0.85 + rng() * 0.35;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const corner = (x === 0 || x === size - 1) && (y === 0 || y === size - 1);
          if (corner || ox + x >= S || oy + y >= S) continue;
          const shade = y === 0 || (x === 0 && y === 1) ? 1.2 : y === size - 1 || x === size - 1 ? 0.78 : 1;
          put(img, ox + x, oy + y, c, tone * shade);
        }
      }
    }
  }
}

/** Beam: a vertical post of rough wood, 6 px wide, with a dark edge and grain lines. */
function beam(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Beam).color);
  for (let y = 0; y < S; y++) {
    for (let x = 5; x < 11; x++) {
      const edge = x === 5 ? 1.18 : x === 10 ? 0.62 : x === 8 ? 0.86 : 1;
      put(img, x, y, c, edge * (rng() < 0.12 ? 0.88 : 1));
    }
  }
  // Iron bands near the top and bottom.
  for (const y of [1, 14]) for (let x = 5; x < 11; x++) put(img, x, y, [70, 70, 76], x === 5 ? 1.3 : 1);
}

/** Crossbeam: a thick horizontal beam along the top of the tile, with two angled braces under it. */
function crossbeam(img: ImageData, rng: Rng): void {
  const c = rgb(tileDef(Tile.Crossbeam).color);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < S; x++) put(img, x, y, c, (y === 0 ? 1.2 : y === 4 ? 0.62 : 1) * (rng() < 0.12 ? 0.88 : 1));
  }
  for (let i = 0; i < 5; i++) {
    put(img, 2 + i, 5 + i, c, 0.8);
    put(img, 13 - i, 5 + i, c, 0.8);
  }
  for (const x of [3, 12]) put(img, x, 2, [70, 70, 76]); // pegs
}

/** Lift rail (Phase 15): two steel rails with cross ties, which double as rungs to climb. */
function liftRail(img: ImageData): void {
  const c = rgb(tileDef(Tile.LiftRail).color);
  const tie: RGB = [74, 78, 86];
  for (const y of [2, 6, 10, 14]) {
    for (let x = 4; x < 12; x++) {
      put(img, x, y, tie, 1.15);
      put(img, x, y + 1, tie, 0.7);
    }
  }
  for (let y = 0; y < S; y++) {
    put(img, 3, y, c, 1.25);
    put(img, 4, y, c, 0.8);
    put(img, 11, y, c, 1.25);
    put(img, 12, y, c, 0.8);
  }
  for (const y of [2, 10]) {
    put(img, 3, y, [210, 214, 220]);
    put(img, 11, y, [210, 214, 220]);
  }
}

/** Lift stop (Phase 15): a call box on a post, with an amber lamp and a call button. */
function liftStop(img: ImageData): void {
  const box: RGB = [86, 92, 102];
  const lamp = rgb(tileDef(Tile.LiftStop).color);
  for (let y = 9; y < S; y++) {
    put(img, 7, y, box, 0.9);
    put(img, 8, y, box, 0.65);
  }
  for (let y = 2; y < 10; y++) {
    for (let x = 4; x < 12; x++) {
      const edge = x === 4 || x === 11 || y === 2 || y === 9;
      put(img, x, y, box, edge ? 0.6 : y === 3 ? 1.2 : 1);
    }
  }
  for (const [x, y] of [[7, 4], [8, 4], [7, 5], [8, 5]] as [number, number][]) put(img, x, y, lamp, y === 4 ? 1.2 : 1);
  put(img, 6, 7, [200, 60, 50]);
  put(img, 9, 7, [80, 200, 90]);
  for (let x = 5; x < 11; x++) put(img, x, S - 1, box, 0.55);
}

const CAMP_CANVAS: RGB = [192, 138, 62];
const CAMP_STONE: RGB = [116, 116, 122];

/**
 * The camp (Phase 15), drawn as one 32 x 32 picture and cut into its four tiles: a canvas tent
 * with a bedroll in its doorway on the left, and a small stone furnace with a chimney on the right.
 */
function campPixel(x: number, y: number, rng: Rng): RGB | null {
  // The tent: an A-frame from its peak at (10, 3) down to the ground across x 0..20.
  const half = ((y - 3) / 28) * 10.5;
  if (y >= 3 && Math.abs(x - 10) <= half) {
    const door = y >= 15 && Math.abs(x - 10) <= ((y - 15) / 16) * 4;
    if (door) return y >= 27 && Math.abs(x - 10) <= 3 ? (y === 27 ? [232, 228, 218] : rgb(tileDef(Tile.BedLeft).color)) : [36, 26, 20];
    const edge = Math.abs(x - 10) > half - 1;
    const shade = edge ? 0.6 : x < 10 ? 1.12 : 0.88;
    return [CAMP_CANVAS[0] * shade * (rng() < 0.1 ? 0.92 : 1), CAMP_CANVAS[1] * shade, CAMP_CANVAS[2] * shade];
  }
  // The furnace: a stone box on the ground with a glowing mouth, and a chimney pipe.
  if (x >= 21 && x <= 30 && y >= 18) {
    if (x >= 23 && x <= 28 && y >= 24 && y <= 29) return y >= 28 ? [255, 150, 50] : y >= 26 ? [200, 70, 30] : [30, 22, 18];
    const edge = x === 21 || x === 30 || y === 18;
    return [CAMP_STONE[0] * (edge ? 0.7 : rng() < 0.2 ? 0.85 : 1), CAMP_STONE[1] * (edge ? 0.7 : 1), CAMP_STONE[2] * (edge ? 0.7 : 1)];
  }
  if (x >= 25 && x <= 26 && y >= 10 && y < 18) return [70, 70, 76];
  return null;
}

function campPart(img: ImageData, rng: Rng, dx: number, dy: number): void {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = campPixel(x + dx * S, y + dy * S, rng);
      if (c) put(img, x, y, c);
    }
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
    case Tile.Gravel: return gravel(img, rng);
    case Tile.Beam: return beam(img, rng);
    case Tile.Crossbeam: return crossbeam(img, rng);
    case Tile.Glowshroom: return glowshroom(img);
    case Tile.GlowCrystal: return glowCrystal(img, rng);
    case Tile.Mudstone: return mudstone(img, rng);
    case Tile.Basalt: return basalt(img, rng);
    case Tile.StoneBricks:
    case Tile.MudstoneBricks:
    case Tile.DeepstoneBricks:
    case Tile.BasaltBricks: return bricks(img, rng, tileDef(id).color);
    case Tile.EmberiteOre: return emberiteOre(img, rng);
    case Tile.RubyOre:
    case Tile.SapphireOre: return gemOre(img, rng, tileDef(id).color);
    case Tile.MushroomStem: return mushroomStem(img, rng);
    case Tile.MushroomCap: return mushroomCap(img, rng);
    case Tile.Sapling: return sapling(img);
    case Tile.MushroomSprout: return mushroomSprout(img);
    case Tile.RubyLamp:
    case Tile.SapphireLamp: return gemLamp(img, tileDef(id).color);
    case Tile.Lava: return lava(img, rng);
    case Tile.HotRock: return hotRock(img, rng);
    case Tile.Floatstone: return floatstone(img, rng);
    case Tile.Heartstone: return heartstone(img, rng);
    case Tile.HeartCore: return heartCore(img);
    case Tile.LiftRail: return liftRail(img);
    case Tile.LiftStop: return liftStop(img);
    case Tile.CampTopLeft: return campPart(img, rng, 0, 0);
    case Tile.CampTopRight: return campPart(img, rng, 1, 0);
    case Tile.CampBottomLeft: return campPart(img, rng, 0, 1);
    case Tile.CampBottomRight: return campPart(img, rng, 1, 1);
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

/** A lantern: a ring handle, a dark iron cap and base, and a glowing glass body between them. */
function lanternIcon(img: ImageData, color: string): void {
  const iron: RGB = [70, 72, 80];
  const glow = rgb(color);
  for (const [x, y] of [[7, 1], [8, 1], [6, 2], [9, 2], [6, 3], [9, 3]] as [number, number][]) put(img, x, y, iron);
  for (let x = 5; x < 11; x++) put(img, x, 4, iron, 1.2);
  for (let y = 5; y < 12; y++) {
    put(img, 4, y, iron);
    put(img, 11, y, iron);
    for (let x = 5; x < 11; x++) put(img, x, y, glow, x === 7 || x === 8 ? (y > 6 && y < 10 ? 1.25 : 1.1) : 0.85);
  }
  for (let x = 4; x < 12; x++) put(img, x, 12, iron, 1.2);
  for (let x = 5; x < 11; x++) put(img, x, 13, iron, 0.8);
}

/** A flare: a red paper tube with a cap, sparking at its tip. */
function flareIcon(img: ImageData, color: string): void {
  const c = rgb(color);
  for (let i = 0; i < 9; i++) {
    put(img, 4 + i, 13 - i, c, 1.05);
    put(img, 5 + i, 13 - i, c, 0.75);
  }
  put(img, 4, 13, [60, 50, 50]);
  put(img, 5, 13, [60, 50, 50]);
  const spark: RGB = [255, 240, 190];
  for (const [x, y] of [[13, 3], [14, 2], [12, 2], [14, 4], [11, 1], [15, 1]] as [number, number][]) put(img, x, y, spark);
}

/** A cut gem: a faceted outline with a bright upper left and a dark lower right. */
function gemIcon(img: ImageData, color: string): void {
  const c = rgb(color);
  const rows: [number, number][] = [
    [5, 10], [4, 11], [3, 12], [3, 12], [4, 11], [5, 10], [6, 9], [7, 8],
  ];
  rows.forEach(([x0, x1], i) => {
    const y = 4 + i;
    for (let x = x0; x <= x1; x++) {
      const upper = i < 2;
      put(img, x, y, c, upper ? 1.35 : x - x0 < (x1 - x0) / 2 ? 1.05 : 0.72);
    }
  });
  for (let x = 5; x <= 10; x++) put(img, x, 6, c, 0.85); // the girdle
  put(img, 6, 4, [255, 255, 255]);
  put(img, 5, 7, [255, 255, 255], 0.9);
}

/** The camp kit: a little tent with a fire glowing beside it. */
function campIcon(img: ImageData, color: string): void {
  const c = rgb(color);
  for (let y = 3; y < 14; y++) {
    const half = ((y - 3) / 10) * 5.5;
    for (let x = 1; x < 13; x++) {
      if (Math.abs(x - 6.5) > half) continue;
      const door = y >= 9 && Math.abs(x - 6.5) <= (y - 9) * 0.6;
      put(img, x, y, door ? [36, 26, 20] : c, door ? 1 : x < 6 ? 1.12 : 0.85);
    }
  }
  for (const [x, y, k] of [[12, 13, 0], [13, 13, 0], [14, 13, 0], [13, 12, 1], [12, 11, 2], [13, 10, 2], [14, 11, 1]] as [number, number, number][]) {
    put(img, x, y, k === 0 ? [110, 74, 44] : k === 1 ? [255, 150, 50] : [255, 220, 120]);
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
    else if (icon.shape === 'lantern') lanternIcon(img, icon.color);
    else if (icon.shape === 'flare') flareIcon(img, icon.color);
    else if (icon.shape === 'gem') gemIcon(img, icon.color);
    else if (icon.shape === 'camp') campIcon(img, icon.color);
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
