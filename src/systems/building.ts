import { PLAYER_HEIGHT, PLAYER_WIDTH, QUICK_TORCH_RADIUS, TILE_SIZE } from '../config';
import type { Player } from '../entities/player';
import { campTiles } from '../world/camp';
import { stopFits } from '../world/lifts';
import { canPlantOn } from '../world/plants';
import { beamFooting, worldGetter } from '../world/supports';
import { isClimbable, isSolid, Tile, tileDef, type TileId } from '../world/tiles';
import type { World } from '../world/world';
import type { Inventory } from './inventory';
import { ITEM_IDS, itemDef, type ItemId } from './items';
import { inReach } from './mining';

/**
 * Can `tile` be placed at (tx, ty)? The spot must be empty air within reach, next to a tile
 * that holds blocks up (no floating blocks), and a solid block can't overlap the player. A beam
 * also needs a beam or firm ground right under it (see beamFooting), and a sapling or mushroom
 * sprout the ground it grows on (see canPlantOn).
 * A lift stop also needs a lift rail beside it and a floor under it (see stopFits).
 * Doors, beds and the camp have their own rules; see doorSpot, bedSpot and campSpot.
 */
export function canPlace(world: World, player: Player, tx: number, ty: number, tile: TileId): boolean {
  if (tile === Tile.DoorClosedBottom) return doorSpot(world, player, tx, ty) !== null;
  if (tile === Tile.BedLeft) return bedSpot(world, player, tx, ty) !== null;
  if (tile === Tile.CampTopLeft) return campSpot(world, player, tx, ty) !== null;
  if (!world.inBounds(tx, ty) || world.getTile(tx, ty) !== Tile.Air) return false;
  if (!inReach(player, tx, ty)) return false;
  if (!canPlantOn(tile, world.getTile(tx, ty + 1))) return false;
  if (tile === Tile.LiftStop && !stopFits(world, tx, ty)) return false;
  const supported =
    holdsBlocks(world.getTile(tx - 1, ty)) ||
    holdsBlocks(world.getTile(tx + 1, ty)) ||
    holdsBlocks(world.getTile(tx, ty - 1)) ||
    holdsBlocks(world.getTile(tx, ty + 1));
  if (!supported) return false;
  if (tile === Tile.Beam && !beamFooting(worldGetter(world), tx, ty)) return false;
  if (isSolid(tile) && overlapsPlayer(player, tx, ty)) return false;
  return true;
}

/**
 * Blocks can be placed against solid tiles, and against ladders, platforms, beams and crossbeams
 * so those can be extended.
 */
function holdsBlocks(tile: TileId): boolean {
  const def = tileDef(tile);
  return isSolid(tile) || isClimbable(tile) || def.oneWay === true || def.support !== undefined;
}

/**
 * Where a door placed at the cursor tile (tx, ty) goes: the cursor can be on its bottom or its
 * top tile. Returns the bottom tile, or null if it doesn't fit: both tiles must be empty and
 * in reach, with solid ground under the door, and the door (placed closed) can't overlap the player.
 */
export function doorSpot(world: World, player: Player, tx: number, ty: number): [number, number] | null {
  for (const by of [ty, ty + 1]) {
    const fits =
      world.inBounds(tx, by - 1) &&
      world.inBounds(tx, by) &&
      world.getTile(tx, by) === Tile.Air &&
      world.getTile(tx, by - 1) === Tile.Air &&
      isSolid(world.getTile(tx, by + 1)) &&
      inReach(player, tx, ty) &&
      !overlapsPlayer(player, tx, by) &&
      !overlapsPlayer(player, tx, by - 1);
    if (fits) return [tx, by];
  }
  return null;
}

/**
 * Where a bed placed at the cursor tile (tx, ty) goes: the cursor can be on its left or its
 * right tile. Returns the left tile, or null if it doesn't fit: both tiles must be empty, with
 * solid ground under both, and the cursor tile in reach. (Beds don't block movement, so they
 * may overlap the player.)
 */
export function bedSpot(world: World, player: Player, tx: number, ty: number): [number, number] | null {
  if (!inReach(player, tx, ty)) return null;
  for (const lx of [tx, tx - 1]) {
    const fits = [lx, lx + 1].every(
      (x) => world.inBounds(x, ty) && world.getTile(x, ty) === Tile.Air && isSolid(world.getTile(x, ty + 1)),
    );
    if (fits) return [lx, ty];
  }
  return null;
}

/**
 * Where a camp placed at the cursor tile (tx, ty) goes: the cursor can be on any of its four
 * tiles (a bottom one first, so it sits on the floor the cursor is over). Returns its top-left
 * tile, or null if it doesn't fit: all four tiles must be empty, with solid ground under both
 * bottom ones, and the cursor tile in reach. (The camp doesn't block movement, so it may overlap
 * the player.) Only one camp can stand at a time; the game checks that (see Game.buildAt).
 */
export function campSpot(world: World, player: Player, tx: number, ty: number): [number, number] | null {
  if (!inReach(player, tx, ty)) return null;
  for (const top of [ty - 1, ty]) {
    for (const left of [tx, tx - 1]) {
      const fits =
        campTiles(left, top).every(([x, y]) => world.inBounds(x, y) && world.getTile(x, y) === Tile.Air) &&
        isSolid(world.getTile(left, top + 2)) &&
        isSolid(world.getTile(left + 1, top + 2));
      if (fits) return [left, top];
    }
  }
  return null;
}

/** Place one of the selected hotbar item at (tx, ty). Returns true if a tile was placed. */
export function tryPlace(world: World, player: Player, inventory: Inventory, tx: number, ty: number): boolean {
  const stack = inventory.selectedStack;
  if (!stack) return false;
  const tile = itemDef(stack.item).placeTile;
  if (tile === null || !canPlace(world, player, tx, ty, tile)) return false;
  if (tile === Tile.DoorClosedBottom) {
    const [bx, by] = doorSpot(world, player, tx, ty)!;
    world.setTile(bx, by - 1, Tile.DoorClosedTop);
    world.setTile(bx, by, Tile.DoorClosedBottom);
  } else if (tile === Tile.BedLeft) {
    const [lx, ly] = bedSpot(world, player, tx, ty)!;
    world.setTile(lx, ly, Tile.BedLeft);
    world.setTile(lx + 1, ly, Tile.BedRight);
  } else if (tile === Tile.CampTopLeft) {
    const [cx, cy] = campSpot(world, player, tx, ty)!;
    for (const [x, y, part] of campTiles(cx, cy)) world.setTile(x, y, part);
  } else {
    world.setTile(tx, ty, tile);
  }
  inventory.removeFromSlot(inventory.selected, 1);
  return true;
}

/**
 * Where quick torch puts a torch: the cursor tile (tx, ty) if a torch can go there, otherwise
 * the spot within QUICK_TORCH_RADIUS tiles of the player that's nearest the player's centre
 * (ties go to the higher spot, so it doesn't end up at the player's feet). Null if there's
 * nowhere a torch can go. Torches follow the usual placement rules (see canPlace).
 */
export function quickTorchSpot(world: World, player: Player, tx: number, ty: number): [number, number] | null {
  if (canPlace(world, player, tx, ty, Tile.Torch)) return [tx, ty];
  const ptx = Math.floor(player.centerX / TILE_SIZE);
  const pty = Math.floor(player.centerY / TILE_SIZE);
  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  for (let y = pty - QUICK_TORCH_RADIUS; y <= pty + QUICK_TORCH_RADIUS; y++) {
    for (let x = ptx - QUICK_TORCH_RADIUS; x <= ptx + QUICK_TORCH_RADIUS; x++) {
      const distance = Math.hypot((x + 0.5) * TILE_SIZE - player.centerX, (y + 0.5) * TILE_SIZE - player.centerY);
      // Rows go top to bottom, so on a tie the higher spot is already the best.
      if (distance < bestDistance - 1e-6 && canPlace(world, player, x, y, Tile.Torch)) {
        best = [x, y];
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** What a left-click does for as long as the button stays down: mine tiles, place blocks, or throw one (a flare). */
export type PrimaryAction = 'dig' | 'build' | 'throw';

/**
 * Decide what a left-click does, from what's held and the tile under the cursor when the button
 * goes down. A held tool is used (a pickaxe digs, a flare is thrown, once per press); a held
 * block is placed on an empty spot; anything else digs with the best pickaxe carried, so the
 * dig-and-build loop never needs a hotbar switch. Deciding once per press keeps a building
 * sweep from mining what it drags across, and a dig from placing blocks.
 */
export function primaryAction(held: ItemId | null, cursorTile: TileId): PrimaryAction {
  if (held === null) return 'dig';
  const def = itemDef(held);
  if (def.pickaxeTier !== undefined) return 'dig';
  if (def.thrown) return 'throw';
  return def.placeTile !== null && cursorTile === Tile.Air ? 'build' : 'dig';
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

/** Does tile (tx, ty) overlap the player's box? */
export function overlapsPlayer(player: Player, tx: number, ty: number): boolean {
  const left = tx * TILE_SIZE;
  const top = ty * TILE_SIZE;
  return (
    player.x < left + TILE_SIZE &&
    player.x + PLAYER_WIDTH > left &&
    player.y < top + TILE_SIZE &&
    player.y + PLAYER_HEIGHT > top
  );
}
