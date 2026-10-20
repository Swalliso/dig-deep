import { TILE_SIZE } from '../config';
import type { Player } from '../entities/player';
import { isSolid, type TileId } from '../world/tiles';
import type { World } from '../world/world';
import { canPlace, overlapsPlayer } from './building';
import { checkMine, inReach } from './mining';

// Smart cursor (a Settings switch, for easier aiming): digging and placing a held block aim along
// the line from the player's centre toward the pointer, out to the player's reach, instead of at
// the tile under the pointer. Everything else (throwing, ropes, right-click, middle-click, quick
// torch) still uses the tile under the pointer. When nothing on the line fits, the game falls
// back to the tile under the pointer, so its hints ("Too far away", "Lift stops go beside a lift
// rail") still show.

/**
 * Tiles along the line from (x0, y0) toward (x1, y1) (world px), in the order the line crosses
 * them: first the tile holding (x0, y0), then on past (x1, y1) until `length` px from the start.
 * Each touches the last by an edge (a line through a corner takes the tile above or below it
 * first), so the line never slips diagonally between two tiles.
 */
export function tilesAlongLine(x0: number, y0: number, x1: number, y1: number, length: number): [number, number][] {
  let tx = Math.floor(x0 / TILE_SIZE);
  let ty = Math.floor(y0 / TILE_SIZE);
  const tiles: [number, number][] = [[tx, ty]];
  const distance = Math.hypot(x1 - x0, y1 - y0);
  if (distance === 0) return tiles;
  const ux = (x1 - x0) / distance;
  const uy = (y1 - y0) / distance;
  // How far along the line the next column and row boundaries are, and the distance between them.
  let nextX = ux > 0 ? ((tx + 1) * TILE_SIZE - x0) / ux : ux < 0 ? (tx * TILE_SIZE - x0) / ux : Infinity;
  let nextY = uy > 0 ? ((ty + 1) * TILE_SIZE - y0) / uy : uy < 0 ? (ty * TILE_SIZE - y0) / uy : Infinity;
  const stepX = ux !== 0 ? TILE_SIZE / Math.abs(ux) : Infinity;
  const stepY = uy !== 0 ? TILE_SIZE / Math.abs(uy) : Infinity;
  for (;;) {
    if (nextX < nextY) {
      if (nextX > length) break;
      tx += Math.sign(ux);
      nextX += stepX;
    } else {
      if (nextY > length) break;
      ty += Math.sign(uy);
      nextY += stepY;
    }
    tiles.push([tx, ty]);
  }
  return tiles;
}

/** The line from the player's centre toward the world point (x, y), out to the player's reach. */
function lineFromPlayer(player: Player, x: number, y: number): [number, number][] {
  // A tile in reach (centre to centre) can be entered up to about half a tile past the reach.
  const length = (player.stats.reach + 1) * TILE_SIZE;
  return tilesAlongLine(player.centerX, player.centerY, x, y, length);
}

/**
 * What a dig aims at with the smart cursor, pointing at the world point (x, y): the first tile
 * on the line from the player toward it that can be dug, if it's within reach. Solid tiles
 * block the line, so it's the nearest one that way. Tiles you can pass through (ladders, ropes,
 * torches, platforms, trees, chests...) are passed over unless they are the tile pointed at, so
 * climbing a ladder or digging along a lit tunnel doesn't take them out. A tile that needs a
 * better pickaxe (or can't be dug at all) still stops the line and is returned, so the dig says
 * why. Null if there's nothing to dig that way within reach.
 */
export function smartDigTarget(world: World, player: Player, x: number, y: number): [number, number] | null {
  const px = Math.floor(x / TILE_SIZE);
  const py = Math.floor(y / TILE_SIZE);
  for (const [tx, ty] of lineFromPlayer(player, x, y)) {
    if (!world.inBounds(tx, ty)) return null;
    const pointed = tx === px && ty === py;
    // 'empty' is air and lava, whatever the pickaxe.
    const diggable = checkMine(world, player, tx, ty, 0) !== 'empty';
    if (!isSolid(world.getTile(tx, ty)) && !(pointed && diggable)) continue;
    return inReach(player, tx, ty) ? [tx, ty] : null;
  }
  return null;
}

/**
 * Where a held block placing `tile` goes with the smart cursor, pointing at the world point
 * (x, y): the first spot on the line from the player toward it where it can be placed (see
 * canPlace, which includes reach). Tiles on the line don't block it (like normal placing), so
 * the blocks just placed don't stop a row growing outward. Spots the player stands in are passed
 * over unless pointed at, so a torch or a ladder doesn't always land on the player. Null if it
 * fits nowhere that way.
 */
export function smartPlaceTarget(world: World, player: Player, x: number, y: number, tile: TileId): [number, number] | null {
  const px = Math.floor(x / TILE_SIZE);
  const py = Math.floor(y / TILE_SIZE);
  for (const [tx, ty] of lineFromPlayer(player, x, y)) {
    if (!world.inBounds(tx, ty)) return null;
    const pointed = tx === px && ty === py;
    if ((pointed || !overlapsPlayer(player, tx, ty)) && canPlace(world, player, tx, ty, tile)) return [tx, ty];
  }
  return null;
}
