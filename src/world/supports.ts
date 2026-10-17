import { BEAM_MAX_HEIGHT, LOOSE_COLUMN_MAX, SPAN_MAX, SUPPORT_REACH } from '../config';
import { tileDef, type TileId } from './tiles';
import type { World } from './world';

// Loose tiles (gravel) and what holds them up (Phase 12). Gravel rests only on the tile directly
// below it. What it rests on holds it if that tile is:
// - firm: any solid tile but gravel (stone, dirt, planks, ore, a closed door...);
// - a beam (post) whose column of beams, at most BEAM_MAX_HEIGHT tall, stands on firm ground;
// - a crossbeam or platform (span) with a tile of its row, at most SPAN_MAX tiles along (itself
//   included), that rests on something: a firm tile or a standing beam at the row's end, a
//   standing beam or firm ground directly below it, or a firm tile directly above it (pinned to the ceiling).
// Supports also reach sideways: the top beam of a standing post, and every tile of an anchored
// span, hold the loose tiles diagonally above them too, up to SUPPORT_REACH columns to each
// side. Firm blocks don't: they hold only what rests right on them.
// Gravel resting on gravel is held when the bottom of its column is. Beams and spans may also
// stand on gravel that itself rests on firm ground. Every check reads a bounded number of tiles.
//
// The rules read tiles through a TileGetter, so a placement preview can ask "what if this tile
// were different?" without touching the world.

/** Reads the tile at (tx, ty). Out of bounds reads Bedrock, as World.getTile does. */
export type TileGetter = (tx: number, ty: number) => TileId;

export function worldGetter(world: World): TileGetter {
  return (tx, ty) => world.getTile(tx, ty);
}

/** The world as it would be with `tile` at (px, py). */
export function withTile(world: World, px: number, py: number, tile: TileId): TileGetter {
  return (tx, ty) => (tx === px && ty === py ? tile : world.getTile(tx, ty));
}

export function isLoose(id: TileId): boolean {
  return tileDef(id).loose === true;
}

/** Solid and not loose: holds up gravel, and anchors beams and spans. */
export function isFirm(id: TileId): boolean {
  const def = tileDef(id);
  return def.solid && !def.loose;
}

export function isSupport(id: TileId): boolean {
  return tileDef(id).support !== undefined;
}

/**
 * Is (tx, ty) firm ground to stand on: a firm tile, or gravel whose column rests on a firm tile?
 * (Not on supports, so the checks can't go round in circles.)
 */
export function isGround(get: TileGetter, tx: number, ty: number): boolean {
  for (let y = ty, n = 0; n <= LOOSE_COLUMN_MAX; y++, n++) {
    const id = get(tx, y);
    if (!isLoose(id)) return isFirm(id);
  }
  return false;
}

/**
 * Has a beam at (tx, ty) got footing: another beam or firm ground right under it? A beam needs it
 * to be placed, and one that loses it breaks (with the beams above it), like a felled tree.
 */
export function beamFooting(get: TileGetter, tx: number, ty: number): boolean {
  return tileDef(get(tx, ty + 1)).support === 'post' || isGround(get, tx, ty + 1);
}

/** A beam at (tx, ty) holds the tile above it: its column of beams is short enough and stands on ground. */
export function postAnchored(get: TileGetter, tx: number, ty: number): boolean {
  let y = ty;
  for (let height = 0; tileDef(get(tx, y)).support === 'post'; y++) {
    if (++height > BEAM_MAX_HEIGHT) return false;
  }
  return isGround(get, tx, y);
}

/**
 * Does span tile (tx, ty) rest on something itself: a standing beam or ground directly below, or
 * solid rock directly above (pinned to the ceiling)?
 */
function spanRests(get: TileGetter, tx: number, ty: number): boolean {
  if (isFirm(get(tx, ty - 1))) return true;
  const below = get(tx, ty + 1);
  return tileDef(below).support === 'post' ? postAnchored(get, tx, ty + 1) : isGround(get, tx, ty + 1);
}

/**
 * A crossbeam or platform at (tx, ty) holds the tile above it: within SPAN_MAX tiles along its
 * row (counting itself as 0), a tile of the row rests on something, or the row ends at a wall or
 * beside a standing beam.
 */
export function spanAnchored(get: TileGetter, tx: number, ty: number): boolean {
  if (spanRests(get, tx, ty)) return true;
  for (const dir of [-1, 1]) {
    for (let d = 1; d <= SPAN_MAX + 1; d++) {
      const x = tx + dir * d;
      const id = get(x, ty);
      if (tileDef(id).support !== 'span') {
        // The row ends here: a wall, or a standing beam, right after a row tile within SPAN_MAX holds it.
        if (isFirm(id) || (tileDef(id).support === 'post' && postAnchored(get, x, ty))) return true;
        break;
      }
      if (d <= SPAN_MAX && spanRests(get, x, ty)) return true;
    }
  }
  return false;
}

/** Can the tile at (tx, ty) hold up a loose tile resting on it? (Loose tiles themselves: see columnHeld.) */
export function holdsLoose(get: TileGetter, tx: number, ty: number): boolean {
  const id = get(tx, ty);
  if (isFirm(id)) return true;
  const support = tileDef(id).support;
  if (support === 'post') return postAnchored(get, tx, ty);
  if (support === 'span') return spanAnchored(get, tx, ty);
  return false;
}

/**
 * Does the support at (tx, ty) hold loose tiles diagonally above it (SUPPORT_REACH)? The top beam
 * of an anchored post does, and so does any tile of an anchored span.
 */
export function reachesSideways(get: TileGetter, tx: number, ty: number): boolean {
  const support = tileDef(get(tx, ty)).support;
  if (support === 'post') return tileDef(get(tx, ty - 1)).support !== 'post' && postAnchored(get, tx, ty);
  if (support === 'span') return spanAnchored(get, tx, ty);
  return false;
}

/** The bottom tile of the loose column through (tx, ty) (which must be loose). */
export function columnBottom(get: TileGetter, tx: number, ty: number): number {
  let y = ty;
  for (let n = 0; n < LOOSE_COLUMN_MAX && isLoose(get(tx, y + 1)); n++) y++;
  return y;
}

/** Is the loose tile at (tx, ty) held up, through the bottom of its column? */
export function columnHeld(get: TileGetter, tx: number, ty: number): boolean {
  const bottom = columnBottom(get, tx, ty);
  // A column taller than the scan counts as held at the part the scan can't see; the part it
  // can see falls first, and the rest is rechecked when that happens.
  if (isLoose(get(tx, bottom + 1))) return true;
  if (holdsLoose(get, tx, bottom + 1)) return true;
  // A support diagonally below the column's bottom reaches it.
  for (let d = 1; d <= SUPPORT_REACH; d++) {
    if (reachesSideways(get, tx - d, bottom + 1) || reachesSideways(get, tx + d, bottom + 1)) return true;
  }
  return false;
}

/** The loose tiles of the column with its bottom at (tx, bottom), bottom first. */
export function columnTiles(get: TileGetter, tx: number, bottom: number): [number, number][] {
  const tiles: [number, number][] = [];
  for (let y = bottom; tiles.length < LOOSE_COLUMN_MAX && isLoose(get(tx, y)); y--) tiles.push([tx, y]);
  return tiles;
}

/** What a change at one tile would do to the loose tiles around it. */
export interface SupportEffect {
  /** Loose tiles that would be held up and aren't now. */
  stabilized: [number, number][];
  /** Loose tiles held up now that wouldn't be. */
  endangered: [number, number][];
  /** Loose tiles nearby that aren't held up either way (they'd fall if disturbed). */
  unsupported: [number, number][];
}

/**
 * Compare the loose tiles near (px, py) as the world is and as it would be with `tile` there,
 * for the placement preview (placing a support) and the removal warning (`tile` = Air). Neither
 * the tile there nor `tile` may be loose, so the gravel columns are the same both ways. Only
 * tiles this one tile could hold up are looked at: SPAN_MAX + SUPPORT_REACH + 1 columns to each
 * side, up to BEAM_MAX_HEIGHT + 2 rows above it.
 */
export function supportEffect(world: World, px: number, py: number, tile: TileId): SupportEffect {
  const now = worldGetter(world);
  const after = withTile(world, px, py, tile);
  const effect: SupportEffect = { stabilized: [], endangered: [], unsupported: [] };
  const side = SPAN_MAX + SUPPORT_REACH + 1;
  for (let tx = px - side; tx <= px + side; tx++) {
    for (let ty = py - BEAM_MAX_HEIGHT - 2; ty < py; ty++) {
      // Each column once, from its bottom tile.
      if (!isLoose(now(tx, ty)) || isLoose(now(tx, ty + 1))) continue;
      const heldNow = columnHeld(now, tx, ty);
      const heldAfter = columnHeld(after, tx, ty);
      const list = heldAfter ? (heldNow ? null : effect.stabilized) : heldNow ? effect.endangered : effect.unsupported;
      list?.push(...columnTiles(now, tx, ty));
    }
  }
  return effect;
}
