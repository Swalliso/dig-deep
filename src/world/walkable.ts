import { SAFE_FALL_TILES } from '../config';
import { isSolid } from './tiles';
import type { World } from './world';

// Can a player get somewhere on foot, without tools? Used by generation (package B1) to check
// that the first cave mouth leads to its cavern and back, and by tests. It's deliberately
// cautious: a player can always do at least this much, so a path it finds is a real one.

/** The tiles a search may visit. */
export interface WalkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WalkRules {
  /** Rows a jump can climb onto a ledge beside you (JUMP_VELOCITY: a full jump clears 4). */
  jump: number;
  /**
   * Columns a running jump crosses, two rows above where it leaves the ground (a full jump at
   * running speed stays that high for about 6 tiles).
   */
  gap: number;
  /** The longest drop allowed, in tiles (falls past SAFE_FALL_TILES hurt). */
  maxFall: number;
}

export const SAFE_WALK: WalkRules = { jump: 4, gap: 4, maxFall: SAFE_FALL_TILES };

const open = (world: World, tx: number, ty: number): boolean => !isSolid(world.getTile(tx, ty));

/**
 * A player stands at (tx, ty) when its feet are in that tile: it and the tile above are open
 * (the player is under 2 tiles tall and under 1 wide) and the tile below is solid.
 */
export function standsAt(world: World, tx: number, ty: number): boolean {
  return open(world, tx, ty) && open(world, tx, ty - 1) && !open(world, tx, ty + 1);
}

/**
 * Search on foot from the standing spot (tx, ty) for one where `goal` holds, inside `box`.
 * Each move goes one column sideways after rising 0..rules.jump rows (walking, the step up or a
 * jump, with headroom in the column it leaves), or 2..rules.gap columns two rows up (a running
 * jump over a gap), then falls to the first floor, at most rules.maxFall rows below the highest
 * point.
 */
export function walkTo(
  world: World,
  tx: number,
  ty: number,
  goal: (tx: number, ty: number) => boolean,
  box: WalkBox,
  rules: WalkRules = SAFE_WALK,
): boolean {
  if (!standsAt(world, tx, ty)) return false;
  const w = box.x1 - box.x0 + 1;
  const inBox = (x: number, y: number): boolean => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
  const seen = new Uint8Array(w * (box.y1 - box.y0 + 1));
  const key = (x: number, y: number): number => (y - box.y0) * w + (x - box.x0);
  const queue: number[] = [tx, ty];
  seen[key(tx, ty)] = 1;
  /** Fall from feet row `top` in column nx to the first floor, and queue the spot if it's new. */
  const landIn = (nx: number, top: number): void => {
    let land = top;
    while (land - top <= rules.maxFall && open(world, nx, land + 1) && inBox(nx, land + 1)) land++;
    if (land - top > rules.maxFall || open(world, nx, land + 1)) return;
    if (!inBox(nx, land) || seen[key(nx, land)]) return;
    seen[key(nx, land)] = 1;
    queue.push(nx, land);
  };
  for (let q = 0; q < queue.length; q += 2) {
    const x = queue[q];
    const y = queue[q + 1];
    if (goal(x, y)) return true;
    for (const dx of [-1, 1]) {
      for (let h = 0; h <= rules.jump; h++) {
        // Rising h rows needs headroom over the player's head in its own column.
        if (h > 0 && !open(world, x, y - 1 - h)) break;
        const top = y - h;
        if (open(world, x + dx, top) && open(world, x + dx, top - 1)) landIn(x + dx, top);
      }
      // A running jump: up two rows, then across columns open from there down to the feet row.
      if (!open(world, x, y - 2) || !open(world, x, y - 3)) continue;
      for (let k = 1; k <= rules.gap; k++) {
        const nx = x + dx * k;
        if (!open(world, nx, y - 1) || !open(world, nx, y - 2) || !open(world, nx, y - 3)) break;
        if (k >= 2) landIn(nx, y - 2);
      }
    }
  }
  return false;
}
