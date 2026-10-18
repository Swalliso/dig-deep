import { LIFT_ACCEL, LIFT_MIN_SPEED, LIFT_RATTLE_DISTANCE, LIFT_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH, SURFACE_LEVEL, TILE_SIZE } from '../config';
import { overlapsSolid } from '../entities/player';
import { floorAt, floorRow, isRail, railSpan, stopRail, stopsOnColumn } from '../world/lifts';
import { STRATA, stratumAt } from '../world/strata';
import type { TileEntities } from '../world/tileEntities';
import { isFloor, isSolid } from '../world/tiles';
import type { World } from '../world/world';

// Lifts (Phase 15): a cage rides each unbroken column of lift rail, between the lift stops
// beside it. Right-clicking a stop opens the lift panel, which lists every stop on that rail;
// picking one calls the cage (if it's elsewhere) and rides it there. While riding, the player is
// attached to the cage, so there's no moving-platform physics: the cage moves, the player is
// put where it is, and at the end they step out at the stop. Cages cost nothing: a rail with no
// cage gets one at the stop where it's first used.

/** A stop, by its tile. */
export interface StopSpot {
  sx: number;
  sy: number;
}

export interface Cage {
  id: number;
  /** The rail column it rides. */
  tx: number;
  /** Its floor (bottom edge), world px, and where it was the step before (for drawing). */
  y: number;
  prevY: number;
  /** Speed, px/s (positive is down). */
  vy: number;
  /** The floor it's heading for, or null when it's parked. */
  target: number | null;
  /** px moved since the last rattle. */
  rattle: number;
}

/** Something that happened to a cage during an update step. */
export type CageEvent =
  | { kind: 'arrived'; cage: Cage }
  | { kind: 'stuck'; cage: Cage }
  | { kind: 'rattle'; cage: Cage }
  | { kind: 'removed'; cage: Cage };

/** How a trip to a stop looks before it starts. */
export type StopStatus =
  /** The stop the panel was opened at. */
  | 'here'
  /** On the same rail, and there's room to arrive. */
  | 'ok'
  /** Something solid stands where the player would step out, or there's no floor there. */
  | 'blocked'
  /** Something solid is above the rail where the cage would stop. */
  | 'noHeadroom'
  /** On the same rail column, but the rail between is broken. */
  | 'disconnected';

export interface StopInfo extends StopSpot {
  name: string;
  /** m below the surface level (negative above it), as the depth meter reads standing there. */
  depth: number;
  status: StopStatus;
  /** For a disconnected stop: the first row with no rail between it and this lift. */
  gapRow?: number;
}

/** Everything the lift panel shows for the stop it was opened at. */
export interface LiftView {
  /** The rail column. */
  rx: number;
  /** Every stop on the column, top first, and which one is this stop. */
  stops: StopInfo[];
  here: number;
  /** This lift's cage, and the row its floor is in. */
  cage: Cage;
  cageRow: number;
}

/** Cages as saved: each one parked at the floor it was at or heading for. */
export interface SavedLifts {
  cages: { tx: number; y: number }[];
}

/** A stop's depth in m: what the depth meter reads standing at it (measured at the feet). */
export function stopDepth(sy: number): number {
  return sy + 1 - SURFACE_LEVEL;
}

/** Top-left of the player standing at a stop (where they step out of the cage). */
export function stopLanding({ sx, sy }: StopSpot): { x: number; y: number } {
  return { x: sx * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2, y: floorAt(sy) - PLAYER_HEIGHT };
}

/** Top-left of the player riding a cage. */
export function riderSpot(cage: Cage): { x: number; y: number } {
  return { x: cage.tx * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2, y: cage.y - PLAYER_HEIGHT };
}

/**
 * Can a trip end at this stop? 'blocked' if the player couldn't stand there (something solid in
 * the way, or no floor under it), 'noHeadroom' if the tile above the rail there is solid, so
 * the cage (two tiles tall) doesn't fit. Null if it's fine.
 */
export function stopProblem(world: World, stop: StopSpot, rx: number): 'blocked' | 'noHeadroom' | null {
  const landing = stopLanding(stop);
  if (overlapsSolid(world, landing.x, landing.y) || !isFloor(world, stop.sx, stop.sy + 1)) return 'blocked';
  if (isSolid(world.getTile(rx, stop.sy - 1))) return 'noHeadroom';
  return null;
}

/** Is nothing solid above (tx, ty), all the way up? */
function underSky(world: World, tx: number, ty: number): boolean {
  for (let y = ty - 1; y >= 0; y--) if (isSolid(world.getTile(tx, y))) return false;
  return true;
}

/**
 * A new stop's name: 'Surface' near the surface level or under the open sky, else the stratum
 * it's in (in strata worlds) or 'Stop', numbered if another stop on the same rail already has
 * that name.
 */
export function defaultStopName(world: World, entities: TileEntities, sx: number, sy: number): string {
  const depth = sy - SURFACE_LEVEL;
  const s = stratumAt(world, sx, sy);
  const base = depth <= 3 || underSky(world, sx, sy) ? 'Surface' : s >= 0 ? STRATA[s].name : 'Stop';
  const rx = stopRail(world, sx, sy);
  const taken = new Set(rx === null ? [] : stopsOnColumn(world, rx).map(({ sx: x, sy: y }) => stopName(entities, x, y)));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** A stop's name, from its tile entity ('Lift stop' if it has none). */
export function stopName(entities: TileEntities, sx: number, sy: number): string {
  const entity = entities.get(sx, sy);
  return entity?.kind === 'liftStop' ? entity.name : 'Lift stop';
}

/** How far (px) to move a cage this step toward `target`, and its new speed. */
export function cageStep(y: number, vy: number, target: number, dt: number): { y: number; vy: number; arrived: boolean } {
  const distance = Math.abs(target - y);
  const dir = Math.sign(target - y);
  const current = Math.sign(vy) === dir ? Math.abs(vy) : 0;
  // Speed up to LIFT_SPEED, but never faster than it can brake from to stop on the target.
  const braking = Math.max(LIFT_MIN_SPEED, Math.sqrt(2 * LIFT_ACCEL * distance));
  const speed = Math.min(LIFT_SPEED, current + LIFT_ACCEL * dt, braking);
  const step = speed * dt;
  if (step >= distance) return { y: target, vy: 0, arrived: true };
  return { y: y + dir * step, vy: dir * speed, arrived: false };
}

export class Lifts {
  cages: Cage[] = [];
  /** The player's trip: riding a cage to a stop. */
  ride: { cage: number; to: StopSpot } | null = null;
  /** A cage called to fetch the player at `from`, to take them on to `to`. */
  pickup: { cage: number; from: StopSpot; to: StopSpot } | null = null;
  private nextId = 1;

  constructor(world?: World, saved?: unknown) {
    if (world && saved) this.restore(world, saved);
  }

  cage(id: number): Cage | null {
    return this.cages.find((c) => c.id === id) ?? null;
  }

  /** The cage riding the unbroken rail through (rx, ry), or null. Any extra cages on it (two rails joined) are removed. */
  cageOn(world: World, rx: number, ry: number): Cage | null {
    const span = railSpan(world, rx, ry);
    if (!span) return null;
    const on = this.cages.filter((c) => c.tx === rx && floorRow(c.y) >= span.top && floorRow(c.y) <= span.bottom);
    if (on.length > 1) {
      const keep = on.find((c) => c.id === this.ride?.cage || c.id === this.pickup?.cage) ?? on[0];
      this.cages = this.cages.filter((c) => !on.includes(c) || c === keep);
      return keep;
    }
    return on[0] ?? null;
  }

  /** The cage on the rail beside a stop, made there if the rail has none yet. Null if the stop has no rail. */
  cageFor(world: World, stop: StopSpot): Cage | null {
    const rx = stopRail(world, stop.sx, stop.sy);
    if (rx === null) return null;
    const existing = this.cageOn(world, rx, stop.sy);
    if (existing) return existing;
    const y = floorAt(stop.sy);
    const cage: Cage = { id: this.nextId++, tx: rx, y, prevY: y, vy: 0, target: null, rattle: 0 };
    this.cages.push(cage);
    return cage;
  }

  /** Send a cage to a stop's row. */
  send(cage: Cage, sy: number): void {
    cage.target = floorAt(sy);
  }

  /** Is the cage parked level with row sy? */
  isAt(cage: Cage, sy: number): boolean {
    return cage.target === null && cage.y === floorAt(sy);
  }

  /** The panel's view of the lift beside the stop at (sx, sy), or null if the stop has no rail. */
  view(world: World, entities: TileEntities, sx: number, sy: number): LiftView | null {
    const rx = stopRail(world, sx, sy);
    const cage = this.cageFor(world, { sx, sy });
    const span = rx === null ? null : railSpan(world, rx, sy);
    if (rx === null || !cage || !span) return null;
    const stops = stopsOnColumn(world, rx).map((stop): StopInfo => {
      const info: StopInfo = { ...stop, name: stopName(entities, stop.sx, stop.sy), depth: stopDepth(stop.sy), status: 'ok' };
      if (stop.sx === sx && stop.sy === sy) info.status = 'here';
      else if (stop.sy < span.top) Object.assign(info, { status: 'disconnected', gapRow: span.top - 1 });
      else if (stop.sy > span.bottom) Object.assign(info, { status: 'disconnected', gapRow: span.bottom + 1 });
      else info.status = stopProblem(world, stop, rx) ?? 'ok';
      return info;
    });
    return { rx, stops, here: stops.findIndex((s) => s.status === 'here'), cage, cageRow: floorRow(cage.y) };
  }

  /**
   * One step: moving cages travel toward their targets. A cage whose rail is gone under it is
   * removed; one that reaches a break in the rail stops there ('stuck').
   */
  update(dt: number, world: World): CageEvent[] {
    const events: CageEvent[] = [];
    this.cages = this.cages.filter((cage) => {
      cage.prevY = cage.y;
      if (!isRail(world.getTile(cage.tx, floorRow(cage.y)))) {
        events.push({ kind: 'removed', cage });
        return false;
      }
      if (cage.target === null) return true;
      const next = cageStep(cage.y, cage.vy, cage.target, dt);
      // Every row the floor moves into must be rail, or the cage stops at the last one that is.
      const from = floorRow(cage.y);
      const to = floorRow(next.y);
      const dir = Math.sign(to - from);
      for (let row = from + dir; dir !== 0 && row !== to + dir; row += dir) {
        if (isRail(world.getTile(cage.tx, row))) continue;
        Object.assign(cage, { y: floorAt(row - dir), vy: 0, target: null });
        events.push({ kind: 'stuck', cage });
        return true;
      }
      cage.rattle += Math.abs(next.y - cage.y);
      Object.assign(cage, { y: next.y, vy: next.vy });
      if (cage.rattle >= LIFT_RATTLE_DISTANCE) {
        cage.rattle -= LIFT_RATTLE_DISTANCE;
        events.push({ kind: 'rattle', cage });
      }
      if (next.arrived) {
        cage.target = null;
        cage.rattle = 0;
        events.push({ kind: 'arrived', cage });
      }
      return true;
    });
    if (this.ride && !this.cage(this.ride.cage)) this.ride = null;
    if (this.pickup && !this.cage(this.pickup.cage)) this.pickup = null;
    return events;
  }

  /** As saved: every cage parked where it is, or where it's heading. */
  saved(): SavedLifts {
    return { cages: this.cages.map((c) => ({ tx: c.tx, y: c.target ?? c.y })) };
  }

  /** Cages from a save, keeping only those parked on a rail tile's floor. */
  private restore(world: World, saved: unknown): void {
    const cages = (saved as Partial<SavedLifts>).cages;
    if (!Array.isArray(cages)) return;
    for (const raw of cages) {
      const c = raw as Partial<{ tx: number; y: number }> | null;
      if (!c || !Number.isInteger(c.tx) || !Number.isFinite(c.y) || c.y! % TILE_SIZE !== 0) continue;
      if (!isRail(world.getTile(c.tx!, floorRow(c.y!)))) continue;
      this.cages.push({ id: this.nextId++, tx: c.tx!, y: c.y!, prevY: c.y!, vy: 0, target: null, rattle: 0 });
    }
  }
}
