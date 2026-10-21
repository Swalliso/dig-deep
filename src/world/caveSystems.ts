import type { NoiseFunction2D } from 'simplex-noise';
import { BEDROCK_BOTTOM_ROWS, CAVE_SOLID_CRUST, SURFACE_LEVEL, type CavernSpec, type CaveSystemsSpec } from '../config';
import { randInt, type Rng } from '../util/rng';
import { STRATA } from './strata';
import { isSolid, Tile, type TileId } from './tiles';
import { standsAt, walkTo, type WalkBox } from './walkable';
import type { FirstCavernSite, World } from './world';

// Cave systems (the strata profile v3, package B1): caves that show ore. Generation carves them
// after the Geode Depths' crystal caverns and before the ores, so ore (some of it started on
// these caves' walls), gravel, glowshrooms and giant mushrooms all see them.

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

/** First row of stratum s in column tx, and the first row below it. */
function stratumRows(world: World, s: number, tx: number): [number, number] {
  const tops = world.strataTops;
  const top = s === 0 ? world.surface[tx] : tops[s - 1][tx];
  const bottom = s < tops.length ? tops[s][tx] : world.height - BEDROCK_BOTTOM_ROWS;
  return [top, bottom];
}

/** Caverns: open air where each stratum's noise beats its threshold, rounded off near the stratum's edges. */
export function carveCaverns(world: World, noise: NoiseFunction2D, caverns: readonly CavernSpec[]): void {
  for (const c of caverns) {
    const offset = c.stratum * 137.1; // each stratum reads its own part of the noise
    for (let tx = 1; tx < world.width - 1; tx++) {
      const [top, bottom] = stratumRows(world, c.stratum, tx);
      for (let ty = top; ty < bottom; ty++) {
        const edge = Math.min(ty - top, bottom - 1 - ty);
        const threshold = c.threshold + Math.max(0, c.edge - edge) * c.edgePenalty;
        if (noise(tx / c.scaleX + offset, ty / c.scaleY) > threshold) world.setTile(tx, ty, Tile.Air);
      }
    }
  }
}

/**
 * Cave networks: tiles along the zero line of `noise`, where `region` allows, then carved
 * `radius` round (through the strata's rock only, below the surface's crust), so the passages
 * are wide enough to walk.
 */
export function carveNetworks(world: World, noise: NoiseFunction2D, region: NoiseFunction2D, spec: CaveSystemsSpec['networks']): void {
  const ridge: number[] = [];
  for (let tx = 2; tx < world.width - 2; tx++) {
    for (const s of spec.strata) {
      const [top, bottom] = stratumRows(world, s, tx);
      for (let ty = Math.max(top, world.surface[tx] + CAVE_SOLID_CRUST); ty < bottom; ty++) {
        const r = region(tx / spec.regionScale, ty / spec.regionScale);
        if (r < spec.regionThreshold) continue;
        const k = Math.min(1, (r - spec.regionThreshold) / spec.regionFade);
        if (Math.abs(noise(tx / spec.scaleX, ty / spec.scaleY)) < spec.width * (0.4 + 0.6 * k)) ridge.push(ty * world.width + tx);
      }
    }
  }
  const rocks: TileId[] = spec.strata.map((s) => STRATA[s].rock);
  const r = spec.radius;
  for (const i of ridge) {
    const x = i % world.width;
    const y = (i - x) / world.width;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 2 || nx > world.width - 3 || ny < world.surface[nx] + CAVE_SOLID_CRUST || ny >= world.height - BEDROCK_BOTTOM_ROWS - 1) continue;
        if (rocks.includes(world.getTile(nx, ny))) world.setTile(nx, ny, Tile.Air);
      }
    }
  }
}

/** Tile changes made by one mouth, so a first mouth that fails its walk check can be undone. */
type Changes = number[];

function carve(world: World, tx: number, ty: number, log: Changes | null): void {
  const was = world.getTile(tx, ty);
  if (was === Tile.Air) return;
  log?.push(ty * world.width + tx, was);
  world.setTile(tx, ty, Tile.Air);
}

function undo(world: World, log: Changes): void {
  for (let i = log.length - 2; i >= 0; i -= 2) {
    const tx = log[i] % world.width;
    world.setTile(tx, (log[i] - tx) / world.width, log[i + 1] as TileId);
  }
}

/** Is the open tile at index i part of an open area of at least n tiles, not counting `mine` (this mouth's own tiles)? */
function openAreaAtLeast(world: World, i: number, mine: Set<number>, n: number): boolean {
  const w = world.width;
  const seen = new Set<number>([i]);
  const stack = [i];
  while (stack.length > 0) {
    const j = stack.pop()!;
    const x = j % w;
    const y = (j - x) / w;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      const k = ny * w + nx;
      if (!world.inBounds(nx, ny) || ny <= world.surface[nx] || seen.has(k) || mine.has(k) || isSolid(world.getTile(nx, ny))) continue;
      seen.add(k);
      if (seen.size >= n) return true;
      stack.push(k);
    }
  }
  return false;
}

interface Tunnel {
  /** Where it ended. */
  x: number;
  y: number;
  angle: number;
}

/**
 * One mouth's tunnel from the surface at column `start`, heading `dir` (-1 left, 1 right): a disc
 * carved each step along a wandering slope. With `firstDepth` set it runs until it's that deep
 * (and `cover` rows into the Stone Caverns); otherwise it stops once it breaks into a cave of
 * spec.joinCave tiles below spec.minDepth, or at spec.maxDepth.
 */
function digTunnel(world: World, rng: Rng, spec: CaveSystemsSpec['mouths'], start: number, dir: number, log: Changes | null, first: { depth: number; cover: number } | null): Tunnel {
  const deg = Math.PI / 180;
  let x = start + 0.5;
  let y = world.surface[start] - 0.5;
  let a = (spec.angleMin + rng() * (spec.angleMax - spec.angleMin)) * deg;
  let turn = 0;
  const phase = rng() * 10;
  const mine = new Set<number>();
  let tail = -1;
  for (let step = 0; step < 400; step++) {
    // Wider at the mouth itself, then breathing a little along the way.
    const r = (step < 4 ? spec.radius + 1 : spec.radius) * (0.8 + 0.45 * (0.5 + 0.5 * Math.sin(step / 7 + phase)));
    const reach = Math.ceil(r);
    let touched = -1;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const tx = Math.floor(x) + dx;
        const ty = Math.floor(y) + dy;
        if (tx < 2 || tx > world.width - 3 || ty < world.surface[tx] || ty >= world.height - BEDROCK_BOTTOM_ROWS - 1) continue;
        const i = ty * world.width + tx;
        if (world.getTile(tx, ty) === Tile.Air) {
          if (!mine.has(i) && ty >= world.surface[tx] + CAVE_SOLID_CRUST) touched = i;
        } else {
          carve(world, tx, ty, log);
          mine.add(i);
        }
      }
    }
    const cx = Math.floor(x);
    if (first) {
      if (y >= SURFACE_LEVEL + first.depth && y >= world.strataTops[0][cx] + first.cover) break;
    } else if (tail >= 0) {
      if (--tail <= 0) break;
    } else if (touched >= 0 && y >= SURFACE_LEVEL + spec.minDepth && openAreaAtLeast(world, touched, mine, spec.joinCave)) {
      tail = 2; // carve a little way into it, then stop
    } else if (y >= SURFACE_LEVEL + spec.maxDepth) {
      break;
    }
    x += Math.cos(a) * dir;
    y += Math.sin(a);
    turn = 0.85 * turn + (rng() * 2 - 1) * spec.wobble * deg;
    a += turn;
    if (a < spec.angleMin * deg) {
      a = spec.angleMin * deg;
      turn = Math.abs(turn);
    }
    if (a > spec.angleMax * deg) {
      a = spec.angleMax * deg;
      turn = -Math.abs(turn);
    }
    if (x < spec.edgeMargin / 2 || x > world.width - spec.edgeMargin / 2) break;
  }
  return { x, y, angle: a };
}

/**
 * The first cavern: a ragged ellipse ahead of where the first mouth ended, with its near tip at
 * the tunnel's end, so the mouth comes out on the rim of its bowl (a mouth breaking in higher up
 * would be an overhang you can't climb back to).
 */
function hollowFirstCavern(world: World, rng: Rng, spec: CaveSystemsSpec['firstCavern'], end: Tunnel, dir: number, log: Changes): Omit<FirstCavernSite, 'mouthTx' | 'mouthTy'> {
  const rx = randInt(rng, spec.rxMin, spec.rxMax);
  const ry = randInt(rng, spec.ryMin, spec.ryMax);
  const cx = Math.min(world.width - rx - 4, Math.max(rx + 3, Math.round(end.x + dir * (rx - 2))));
  const cy = Math.round(end.y + 1);
  for (let ty = cy - ry - 1; ty <= cy + ry + 1; ty++) {
    for (let tx = cx - rx - 1; tx <= cx + rx + 1; tx++) {
      const d = ((tx - cx) / (rx + 0.5)) ** 2 + ((ty - cy) / (ry + 0.5)) ** 2;
      if (d > 1 || (d > 0.75 && rng() < 0.5)) continue;
      carve(world, tx, ty, log);
    }
  }
  return { cx, cy, rx, ry };
}

/** Is (tx, ty) inside the first cavern's ellipse? */
export function inFirstCavern(site: FirstCavernSite, tx: number, ty: number): boolean {
  return ((tx - site.cx) / (site.rx + 0.5)) ** 2 + ((ty - site.cy) / (site.ry + 0.5)) ** 2 <= 1;
}

/** The highest standing spot in column tx, searching down from the top of the world. */
function topStandingSpot(world: World, tx: number): number {
  for (let ty = 1; ty < world.height - 1; ty++) if (standsAt(world, tx, ty)) return ty;
  return -1;
}

/**
 * Can the first cavern be walked to from the surface beside its mouth, and back out? Back out
 * means standing on the surface again anywhere in the search box.
 */
export function firstCavernWalkable(world: World, site: FirstCavernSite): boolean {
  const box: WalkBox = {
    x0: Math.max(1, Math.min(site.mouthTx, site.cx - site.rx) - 30),
    x1: Math.min(world.width - 2, Math.max(site.mouthTx, site.cx + site.rx) + 30),
    y0: 1,
    y1: Math.min(world.height - 2, site.cy + site.ry + 4),
  };
  if (!walkTo(world, site.mouthTx, site.mouthTy, (x, y) => inFirstCavern(site, x, y), box)) return false;
  // Back out from the cavern's floor under its middle (or the nearest column with one).
  for (let k = 0; k <= site.rx; k++) {
    for (const tx of [site.cx - k, site.cx + k]) {
      for (let ty = site.cy; ty <= site.cy + site.ry + 1; ty++) {
        if (!standsAt(world, tx, ty)) continue;
        return walkTo(world, tx, ty, (x, y) => y <= world.surface[x], box);
      }
    }
  }
  return false;
}

/**
 * Cave mouths: spec.mouths.count tunnels from the surface into the caves. The others are dug
 * first; then the first, near the spawn, with its cavern, tried again from another column (or
 * the other side) until the cavern can be walked to and back. Records it in world.firstCavern.
 */
export function digMouths(world: World, rng: Rng, spec: CaveSystemsSpec): void {
  const m = spec.mouths;
  const spawn = Math.floor(world.width / 2);
  const side = rng() < 0.5 ? -1 : 1;
  const firstColumn = spawn + side * randInt(rng, m.nearMin, m.nearMax);
  const columns = [firstColumn];
  for (let tries = 0; columns.length < m.count && tries < 200; tries++) {
    const tx = randInt(rng, m.edgeMargin, world.width - 1 - m.edgeMargin);
    if (Math.abs(tx - spawn) < m.nearMin || columns.some((c) => Math.abs(c - tx) < m.spacing)) continue;
    columns.push(tx);
  }
  const away = (tx: number): number => (tx < spawn ? -1 : 1); // heading away keeps the spawn's ground whole
  for (const tx of columns.slice(1)) digTunnel(world, rng, m, tx, away(tx), null, null);

  const f = spec.firstCavern;
  for (let attempt = 0; attempt < f.tries; attempt++) {
    const start = attempt === 0 ? firstColumn : spawn + (attempt % 2 === 0 ? side : -side) * randInt(rng, m.nearMin, m.nearMax);
    const dir = away(start);
    // The walk down starts on the grass a few columns before the mouth, on the spawn's side.
    const mouthTx = start - dir * 5;
    const mouthTy = topStandingSpot(world, mouthTx);
    const log: Changes = [];
    const end = digTunnel(world, rng, m, start, dir, log, { depth: randInt(rng, f.depthMin, f.depthMax), cover: f.cover + f.ryMax });
    const site: FirstCavernSite = { mouthTx, mouthTy, ...hollowFirstCavern(world, rng, f, end, dir, log) };
    if (attempt === f.tries - 1 || firstCavernWalkable(world, site)) {
      world.firstCavern = site;
      return;
    }
    undo(world, log);
  }
}

/**
 * Rock faces of stratum s: its rock with air on a side, as indices (ty * width + tx) in row
 * order, so a band of rows is one slice.
 */
export function rockFaces(world: World, s: number): Int32Array {
  const rock = STRATA[s].rock;
  const tops = world.strataTops;
  const faces: number[] = [];
  const y0 = Math.min(...tops[s - 1]);
  const y1 = s < tops.length ? Math.max(...tops[s]) : world.height - 1;
  const air = (tx: number, ty: number): boolean => world.getTile(tx, ty) === Tile.Air;
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = 1; tx < world.width - 1; tx++) {
      if (world.getTile(tx, ty) !== rock) continue;
      const [top, bottom] = stratumRows(world, s, tx);
      if (ty < top || ty >= bottom) continue;
      if (air(tx - 1, ty) || air(tx + 1, ty) || air(tx, ty - 1) || air(tx, ty + 1)) faces.push(ty * world.width + tx);
    }
  }
  return Int32Array.from(faces);
}

/** The part of `faces` (in row order) in rows top..bottom. */
export function facesInRows(faces: Int32Array, width: number, top: number, bottom: number): Int32Array {
  const lowerBound = (value: number): number => {
    let lo = 0;
    let hi = faces.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (faces[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return faces.subarray(lowerBound(top * width), lowerBound((bottom + 1) * width));
}
