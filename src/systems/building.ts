import { PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from '../config';
import type { Player } from '../entities/player';
import { isSolid, Tile, type TileId } from '../world/tiles';
import type { World } from '../world/world';
import type { Inventory } from './inventory';
import { itemDef } from './items';
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
