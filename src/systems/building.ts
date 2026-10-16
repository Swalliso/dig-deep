import { PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from '../config';
import type { Player } from '../entities/player';
import { isSolid, Tile, tileDef, type TileId } from '../world/tiles';
import type { World } from '../world/world';
import type { Inventory } from './inventory';
import { ITEM_IDS, itemDef, type ItemId } from './items';
import { inReach } from './mining';

/**
 * Can `tile` be placed at (tx, ty)? The spot must be empty air within reach, next to a solid
 * tile (no floating blocks), and a solid block can't overlap the player.
 */
export function canPlace(world: World, player: Player, tx: number, ty: number, tile: TileId): boolean {
  if (!world.inBounds(tx, ty) || world.getTile(tx, ty) !== Tile.Air) return false;
  if (!inReach(player, tx, ty)) return false;
  const supported =
    isSolid(world.getTile(tx - 1, ty)) ||
    isSolid(world.getTile(tx + 1, ty)) ||
    isSolid(world.getTile(tx, ty - 1)) ||
    isSolid(world.getTile(tx, ty + 1));
  if (!supported) return false;
  if (isSolid(tile) && overlapsPlayer(player, tx, ty)) return false;
  return true;
}

/** Place one of the selected hotbar item at (tx, ty). Returns true if a tile was placed. */
export function tryPlace(world: World, player: Player, inventory: Inventory, tx: number, ty: number): boolean {
  const stack = inventory.selectedStack;
  if (!stack) return false;
  const tile = itemDef(stack.item).placeTile;
  if (tile === null || !canPlace(world, player, tx, ty, tile)) return false;
  world.setTile(tx, ty, tile);
  inventory.removeFromSlot(inventory.selected, 1);
  return true;
}

/** The item that places `tile`, for middle-click pick. Grass gives dirt (what it drops). Null if none. */
export function itemForTile(tile: TileId): ItemId | null {
  const placer = ITEM_IDS.find((id) => itemDef(id).placeTile === tile);
  if (placer) return placer;
  const drop = tileDef(tile).drop;
  return drop && itemDef(drop).placeTile !== null ? drop : null;
}

/**
 * Tiles on the line from (tx0, ty0) to (tx1, ty1), both ends included, each one touching the
 * last by an edge. Drag-building fills these in, so a fast sweep doesn't leave gaps.
 */
export function tilesOnLine(tx0: number, ty0: number, tx1: number, ty1: number): [number, number][] {
  const tiles: [number, number][] = [[tx0, ty0]];
  const dx = Math.abs(tx1 - tx0);
  const dy = Math.abs(ty1 - ty0);
  const sx = Math.sign(tx1 - tx0);
  const sy = Math.sign(ty1 - ty0);
  let x = tx0;
  let y = ty0;
  // Step along whichever axis is further behind the ideal line.
  for (let ix = 0, iy = 0; ix < dx || iy < dy; ) {
    if ((0.5 + ix) * dy < (0.5 + iy) * dx) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    tiles.push([x, y]);
  }
  return tiles;
}

function overlapsPlayer(player: Player, tx: number, ty: number): boolean {
  const left = tx * TILE_SIZE;
  const top = ty * TILE_SIZE;
  return (
    player.x < left + TILE_SIZE &&
    player.x + PLAYER_WIDTH > left &&
    player.y < top + TILE_SIZE &&
    player.y + PLAYER_HEIGHT > top
  );
}
