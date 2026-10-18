import {
  BACKGROUND_FILL_BELOW,
  BACKGROUND_SHADE,
  BACKGROUND_SHADE_DEPTH,
  BACKGROUND_STRIP_WIDTH,
  SURFACE_LEVEL,
  TILE_SIZE,
  type BackgroundLayerSpec,
} from '../config';
import { createRng, randInt, type Rng } from '../util/rng';

// Parallax background: procedural pixel-art strips (clouds, mountains, hills) that repeat
// sideways and scroll slower than the world, built once per world from its seed. The math
// (skyline shapes and scroll offsets) is pure so it can be tested; the strips are canvases.
// Strata worlds also get an underground set per stratum: strips that repeat both ways, of rock
// ledges with formations growing up from them and hanging down under them (see buildCave).

type RGB = [number, number, number];

const SURFACE_PX = SURFACE_LEVEL * TILE_SIZE;

/** A built layer: its strip image and the strip row that lines up with the layer's horizon. */
export interface BackgroundLayer {
  spec: BackgroundLayerSpec;
  canvas: HTMLCanvasElement;
  horizonRow: number;
  /** CSS colour filling the view below the strip (skylines only); null for clouds and underground layers. */
  fill: string | null;
}

/** Underground layers repeat up and down as well as sideways. */
export function isCaveLayer(spec: BackgroundLayerSpec): boolean {
  return spec.kind !== 'clouds' && spec.kind !== 'mountains' && spec.kind !== 'hills';
}

/**
 * Where an underground layer's repeating image starts (world px from the view's top-left, x and
 * y): it scrolls `factor` times as fast as the camera, and its ledges sit `lift` px lower.
 */
export function caveOffset(camX: number, camY: number, factor: number, lift: number): [number, number] {
  return [Math.round(-camX * factor) || 0, Math.round(-camY * factor + lift) || 0];
}

/** How much darker a skyline layer is `depth` world px below its ridge (0..BACKGROUND_SHADE). */
export function depthShade(depth: number): number {
  return BACKGROUND_SHADE * Math.min(1, Math.max(0, depth) / BACKGROUND_SHADE_DEPTH);
}

/**
 * Skyline heights for one strip: `width` whole numbers in [min, max] that join up seamlessly
 * (the value after the last is the first), made of waves whose periods divide the width.
 * `ridged` gives sharp peaks (mountains); otherwise the skyline rolls (hills).
 */
export function periodicSkyline(rng: Rng, width: number, min: number, max: number, ridged: boolean): number[] {
  const waves = [1, 2, 3, 5, 8, 13, 21].map((k, i) => ({
    k,
    amp: (0.55 + 0.45 * rng()) / (i + 1) ** (ridged ? 0.7 : 1.1),
    phase: rng() * Math.PI * 2,
  }));
  const raw: number[] = [];
  for (let x = 0; x < width; x++) {
    let v = 0;
    for (const w of waves) {
      const a = (Math.PI * w.k * x) / width + w.phase;
      // |sin| repeats every width / k, and sin(2a) every width / k too, so the strip tiles.
      v += w.amp * (ridged ? 1 - 2 * Math.abs(Math.sin(a)) : Math.sin(2 * a));
    }
    raw.push(v);
  }
  const lo = Math.min(...raw);
  const hi = Math.max(...raw);
  return raw.map((v) => Math.round(min + ((v - lo) / (hi - lo || 1)) * (max - min)));
}

/**
 * Where a layer's strip starts on screen (world px, in (-width, 0]) for a camera at camX. The
 * strip is drawn from there every `width` px across the view. `drift` adds a slow time-based
 * slide (clouds).
 */
export function parallaxX(camX: number, factor: number, width: number, drift = 0): number {
  const shift = camX * factor + drift;
  const offset = ((shift % width) + width) % width;
  return offset === 0 ? 0 : -offset;
}

/**
 * Screen y (world px from the top of the view) of a layer's horizon for a camera whose top is
 * at camY. With the view centred on the average surface, the horizon sits `lift` px above the
 * middle of the screen; moving the camera moves it by `factor` times as much.
 */
export function parallaxY(camY: number, factor: number, lift: number, viewHeight: number): number {
  const centredOnSurface = SURFACE_PX - viewHeight / 2;
  return viewHeight / 2 - lift - (camY - centredOnSurface) * factor;
}

/**
 * Build every layer of a background set for the world with this seed. `salt` tells sets apart,
 * so each stratum's set comes out different.
 */
export function buildBackground(seed: number, specs: readonly BackgroundLayerSpec[], salt = 0): BackgroundLayer[] {
  return specs.map((spec, i) => {
    const rng = createRng((seed ^ Math.imul(i + 101 + salt * 16, 0x9e3779b9)) >>> 0);
    if (spec.kind === 'clouds') return buildClouds(spec, rng);
    if (isCaveLayer(spec)) return buildCave(spec, rng);
    return buildSkyline(spec, rng);
  });
}

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * One strip's pixels; x wraps around so shapes crossing the edge come back on the other side
 * (and y too, for underground strips, which repeat up and down).
 */
class Strip {
  readonly width: number;
  readonly height: number;
  readonly img: ImageData;
  private readonly wrapY: boolean;

  constructor(width: number, height: number, wrapY = false) {
    this.width = width;
    this.height = height;
    this.img = new ImageData(width, height);
    this.wrapY = wrapY;
  }

  put(x: number, y: number, c: RGB, shade = 1): void {
    if (this.wrapY) y = ((y % this.height) + this.height) % this.height;
    if (y < 0 || y >= this.height) return;
    const i = (y * this.width + (((x % this.width) + this.width) % this.width)) * 4;
    const d = this.img.data;
    d[i] = Math.min(255, c[0] * shade);
    d[i + 1] = Math.min(255, c[1] * shade);
    d[i + 2] = Math.min(255, c[2] * shade);
    d[i + 3] = 255;
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    ctx.putImageData(this.img, 0, 0);
    return canvas;
  }
}

/** Mountains (sharp peaks, snow on the highest) or hills (rolling, dotted with trees). */
function buildSkyline(spec: BackgroundLayerSpec, rng: Rng): BackgroundLayer {
  const W = BACKGROUND_STRIP_WIDTH;
  const treeRoom = spec.kind === 'hills' ? 12 : 0;
  const height = spec.maxHeight + treeRoom + BACKGROUND_FILL_BELOW;
  const horizonRow = height - BACKGROUND_FILL_BELOW;
  const strip = new Strip(W, height);
  const base = rgb(spec.color);
  const accent = rgb(spec.accent);
  const mountains = spec.kind === 'mountains';
  const skyline = periodicSkyline(rng, W, spec.minHeight, spec.maxHeight, mountains);
  const snowLine = spec.minHeight + 0.68 * (spec.maxHeight - spec.minHeight);

  for (let x = 0; x < W; x++) {
    const top = horizonRow - skyline[x];
    for (let y = top; y < height; y++) {
      // Darker further below the ridge, with a faint diagonal texture so big areas of one colour
      // still read as pixel art.
      strip.put(x, y, base, 1 - depthShade(y - top) - ((x * 3 + y * 5) % 23 === 0 ? 0.04 : 0));
    }
    if (mountains && skyline[x] > snowLine) {
      const depth = Math.round((skyline[x] - snowLine) * 0.4) + ((x * 7) % 3);
      for (let y = top; y < top + depth; y++) strip.put(x, y, accent);
    }
  }

  if (!mountains) {
    // Tree silhouettes standing on the skyline: round broadleaves and pointed conifers.
    for (let x = randInt(rng, 0, 12); x < W; x += randInt(rng, 5, 26)) {
      const ground = horizonRow - skyline[x];
      if (rng() < 0.5) {
        const r = randInt(rng, 2, 4);
        const cy = ground - randInt(rng, 2, 3) - r;
        for (let y = cy; y < ground; y++) strip.put(x, y, accent); // trunk
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) strip.put(x + dx, cy + dy, accent);
        }
      } else {
        const h = randInt(rng, 6, 11);
        for (let dy = 0; dy < h; dy++) {
          const half = Math.floor((dy * 3) / h + 0.5);
          for (let dx = -half; dx <= half; dx++) strip.put(x + dx, ground - h + dy, accent);
        }
      }
    }
  }
  const s = 1 - BACKGROUND_SHADE;
  const fill = `rgb(${Math.round(base[0] * s)}, ${Math.round(base[1] * s)}, ${Math.round(base[2] * s)})`;
  return { spec, canvas: strip.toCanvas(), horizonRow, fill };
}

/** Underground strips: the share (0..100) of each ledge's length below which there's a gap instead. */
const LEDGE_GAP = 40;

/**
 * An underground layer: a strip `period` px tall that repeats both ways. Pieces of wavy rock ledge
 * run along its bottom, with gaps between them; formations stand on the ledges and hang from
 * their undersides, wrapping round to the top of the strip, so when strips stack the gap between
 * two rows of ledges is a cave with growths from its floor and its ceiling. What grows depends on
 * the kind: stalagmites and stalactites, giant mushrooms over hanging roots, crystal clusters, or
 * basalt columns over glowing cracks.
 */
function buildCave(spec: BackgroundLayerSpec, rng: Rng): BackgroundLayer {
  const W = BACKGROUND_STRIP_WIDTH;
  const H = spec.period ?? 160;
  const strip = new Strip(W, H, true);
  const base = rgb(spec.color);
  const accent = rgb(spec.accent);
  const line = H - 14;
  const wrap = (x: number): number => ((x % W) + W) % W;
  const rise = periodicSkyline(rng, W, 2, 16, false);
  const drop = periodicSkyline(rng, W, 5, 12, false);
  const presence = periodicSkyline(rng, W, 0, 100, false);
  /** How much ledge there is at x: 0 in a gap, up to 1 a few px into a piece, so pieces taper at their ends. */
  const ledge = (x: number): number => Math.min(1, Math.max(0, (presence[wrap(x)] - LEDGE_GAP) / 8));
  const ledgeTop = (x: number): number => line - Math.round(rise[wrap(x)] * ledge(x));
  const ledgeBottom = (x: number): number => line + Math.round(drop[wrap(x)] * ledge(x));
  /** Formations only grow where the ledge is solid. */
  const onLedge = (x: number): boolean => ledge(x) >= 0.75;
  for (let x = 0; x < W; x++) {
    if (ledge(x) === 0) continue;
    const y0 = ledgeTop(x);
    const y1 = Math.max(y0 + 1, ledgeBottom(x));
    for (let y = y0; y < y1; y++) strip.put(x, y, base, y === y0 ? 1.15 : 1 - (0.12 * (y - y0)) / (y1 - y0));
  }
  const heights = (scale = 1): number => Math.round(randInt(rng, spec.minHeight, spec.maxHeight) * scale);

  /** A pointed spike `h` tall and `half` wide each side at its base, up (dir -1) or down (dir 1) from row y. */
  const spike = (x: number, y: number, h: number, half: number, dir: 1 | -1, lean = 0): void => {
    for (let d = 0; d < h; d++) {
      const w = Math.round(half * (1 - d / h));
      const cx = x + Math.round(lean * d);
      for (let dx = -w; dx <= w; dx++) strip.put(cx + dx, y + dir * d, dx < 0 ? accent : base, dx < 0 ? 1 : 1.05);
    }
  };

  if (spec.kind === 'stalactites') {
    for (let x = randInt(rng, 0, 10); x < W; x += randInt(rng, 7, 30)) {
      if (onLedge(x)) spike(x, ledgeTop(x), heights(), randInt(rng, 2, 6), -1);
    }
    for (let x = randInt(rng, 0, 10); x < W; x += randInt(rng, 6, 24)) {
      if (onLedge(x)) spike(x, ledgeBottom(x), heights(0.8), randInt(rng, 2, 5), 1);
    }
  } else if (spec.kind === 'mushrooms') {
    for (let x = randInt(rng, 0, 20); x < W; x += randInt(rng, 18, 56)) {
      if (!onLedge(x)) continue;
      const h = heights();
      const r = randInt(rng, 6, 14);
      const ground = ledgeTop(x);
      const stem = randInt(rng, 1, 2);
      for (let y = ground - h; y < ground; y++) for (let dx = -stem; dx <= stem; dx++) strip.put(x + dx, y, base, dx < 0 ? 1.15 : 1);
      // A domed cap, lighter on top, with pale spots.
      const capH = Math.max(3, Math.round(r * 0.55));
      for (let dy = 0; dy < capH; dy++) {
        const w = Math.round(r * Math.sqrt(1 - (dy / capH) ** 2));
        for (let dx = -w; dx <= w; dx++) strip.put(x + dx, ground - h - dy, accent, dy === capH - 1 ? 1.2 : 1 - dy * 0.02);
      }
      for (let k = 0; k < 3; k++) strip.put(x + randInt(rng, -r + 2, r - 2), ground - h - randInt(rng, 1, capH - 1), accent, 1.5);
    }
    // Roots hanging under the ledge.
    for (let x = randInt(rng, 0, 6); x < W; x += randInt(rng, 3, 14)) {
      if (!onLedge(x)) continue;
      const length = heights(0.5);
      let rx = x;
      for (let d = 0; d < length; d++) {
        strip.put(rx, ledgeBottom(x) + d, base, 0.92);
        if (rng() < 0.2) rx += rng() < 0.5 ? -1 : 1;
      }
    }
  } else if (spec.kind === 'crystals') {
    const cluster = (x: number, y: number, dir: 1 | -1, scale: number): void => {
      for (let k = randInt(rng, 2, 4); k > 0; k--) {
        spike(x + randInt(rng, -4, 4), y, heights(scale * (0.5 + rng() * 0.5)), randInt(rng, 1, 3), dir, (rng() - 0.5) * 0.6);
      }
    };
    for (let x = randInt(rng, 0, 20); x < W; x += randInt(rng, 16, 44)) {
      if (onLedge(x)) cluster(x, ledgeTop(x), -1, 1);
    }
    for (let x = randInt(rng, 0, 20); x < W; x += randInt(rng, 20, 50)) {
      if (onLedge(x)) cluster(x, ledgeBottom(x), 1, 0.7);
    }
  } else {
    // Basalt columns standing in rows, a dark joint between each, and cracks along the ledge glowing dully.
    for (let x = randInt(rng, 0, 30); x < W; x += randInt(rng, 26, 70)) {
      const columns = randInt(rng, 2, 6);
      let cx = x;
      for (let k = 0; k < columns && onLedge(cx); k++) {
        const w = randInt(rng, 3, 6);
        const h = heights(0.6 + rng() * 0.4);
        const ground = ledgeTop(cx);
        for (let dx = 0; dx < w; dx++) {
          const top = ground - h + (dx === 0 || dx === w - 1 ? 1 : 0);
          for (let y = top; y < ground; y++) strip.put(cx + dx, y, base, dx === 0 ? 1.15 : dx === w - 1 ? 0.8 : 1);
        }
        cx += w + 1;
      }
    }
    for (let x = randInt(rng, 0, 30); x < W; x += randInt(rng, 12, 40)) {
      if (!onLedge(x)) continue;
      const length = randInt(rng, 4, 14);
      let y = line + randInt(rng, 0, 3);
      for (let dx = 0; dx < length; dx++) {
        strip.put(x + dx, y, accent, dx === Math.floor(length / 2) ? 1.3 : 1);
        if (rng() < 0.3) y += rng() < 0.5 ? -1 : 1;
      }
    }
    for (let x = randInt(rng, 0, 10); x < W; x += randInt(rng, 9, 30)) {
      if (onLedge(x)) spike(x, ledgeBottom(x), heights(0.4), randInt(rng, 1, 3), 1);
    }
  }
  return { spec, canvas: strip.toCanvas(), horizonRow: 0, fill: null };
}

/** Puffy clouds: a few overlapping circles each, white with a shaded underside. */
function buildClouds(spec: BackgroundLayerSpec, rng: Rng): BackgroundLayer {
  const W = BACKGROUND_STRIP_WIDTH;
  const height = spec.maxHeight + 24;
  const horizonRow = height;
  const strip = new Strip(W, height);
  const white = rgb(spec.color);
  const shade = rgb(spec.accent);
  const count = 7;
  for (let n = 0; n < count; n++) {
    const cx = Math.floor((n * W) / count) + randInt(rng, 0, Math.floor(W / count) - 40);
    const cy = horizonRow - randInt(rng, spec.minHeight + 12, spec.maxHeight);
    const puffs = randInt(rng, 3, 5);
    const bottom = cy + 4;
    for (let p = 0; p < puffs; p++) {
      const px = cx + p * randInt(rng, 6, 10);
      const r = randInt(rng, 5, 9) - (p === 0 || p === puffs - 1 ? 2 : 0);
      const py = cy + 2 - Math.floor(r / 2);
      for (let dy = -r; dy <= r; dy++) {
        const y = py + dy;
        if (y > bottom) continue; // flat bottoms
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          strip.put(px + dx, y, y >= bottom - 2 ? shade : white);
        }
      }
    }
  }
  return { spec, canvas: strip.toCanvas(), horizonRow, fill: null };
}
