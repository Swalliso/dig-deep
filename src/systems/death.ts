import { FALLBACK_SEARCH, HOTBAR_SIZE, PLAYER_HEIGHT, PLAYER_WIDTH, SATCHEL_SIZE, TILE_SIZE } from '../config';
import { overlapsSolid, type Player } from '../entities/player';
import { isWholeBed } from '../world/beds';
import { isWholeCamp } from '../world/camp';
import { isFloor, isSolid } from '../world/tiles';
import type { World } from '../world/world';
import type { Inventory, ItemStack } from './inventory';
import { ITEMS, itemDef, type ItemId } from './items';

// Dying and coming back: the bag goes into a satchel where you died (the hotbar and every
// pickaxe stay with you), and you respawn at your bed or your camp (whichever was set last), the
// other one if that's gone or blocked, or near the world spawn. Satchels stay until collected,
// and are saved with the world.

/** Bag contents left where the player died. Stays put (it doesn't fall) until it's emptied. */
export interface Satchel {
  /** Top-left, world px. SATCHEL_SIZE square. */
  x: number;
  y: number;
  stacks: ItemStack[];
}

/** The player's bed, by its left tile (or the camp, by its top-left tile). */
export interface BedSpot {
  tx: number;
  ty: number;
}

/** Which respawn point was set last: the bed, or the camp (Phase 15). */
export type RespawnChoice = 'bed' | 'camp';

/**
 * Empty the bag (the slots after the hotbar) into a list of stacks, leaving pickaxes where they
 * are: the best carried pickaxe always mines, so losing it would strand the player. The hotbar
 * isn't touched.
 */
export function takeBag(inventory: Inventory): ItemStack[] {
  const taken: ItemStack[] = [];
  for (let i = HOTBAR_SIZE; i < inventory.slots.length; i++) {
    const stack = inventory.slots[i];
    if (!stack || itemDef(stack.item).pickaxeTier !== undefined) continue;
    taken.push(stack);
    inventory.slots[i] = null;
  }
  return taken;
}

/** A satchel holding `stacks` at the feet of the player, or null if there's nothing to hold. */
export function dropSatchel(player: Player, stacks: ItemStack[]): Satchel | null {
  if (stacks.length === 0) return null;
  return { x: player.centerX - SATCHEL_SIZE / 2, y: player.y + PLAYER_HEIGHT - SATCHEL_SIZE, stacks };
}

/**
 * Move as much of the satchel as fits into the inventory. Whatever doesn't fit stays in the
 * satchel. Returns how many items moved; the satchel is empty when its stacks are.
 */
export function collectSatchel(satchel: Satchel, inventory: Inventory): number {
  let moved = 0;
  satchel.stacks = satchel.stacks.filter((stack) => {
    const left = inventory.add(stack.item, stack.count);
    moved += stack.count - left;
    stack.count = left;
    return left > 0;
  });
  return moved;
}

/** Does the player's box touch the satchel? */
export function touchesSatchel(player: Player, satchel: Satchel): boolean {
  return (
    player.x < satchel.x + SATCHEL_SIZE &&
    player.x + PLAYER_WIDTH > satchel.x &&
    player.y < satchel.y + SATCHEL_SIZE &&
    player.y + PLAYER_HEIGHT > satchel.y
  );
}

export function satchelItemCount(satchel: Satchel): number {
  return satchel.stacks.reduce((n, s) => n + s.count, 0);
}

/** Where the player respawns (top-left, world px), and whether it's the bed, the camp or the fallback. */
export interface RespawnPoint {
  x: number;
  y: number;
  atBed: boolean;
  atCamp: boolean;
}

/** Top-left of the player standing on the floor under tile row `ty`, centred on world x `cx`. */
function standingAt(cx: number, ty: number): { x: number; y: number } {
  return { x: cx - PLAYER_WIDTH / 2, y: (ty + 1) * TILE_SIZE - PLAYER_HEIGHT };
}

/** Standing at the bed (or the camp's bottom row, at `row`), if it's whole with room to stand and a floor under it. */
function restingSpot(world: World, spot: BedSpot, row: number): { x: number; y: number } | null {
  const at = standingAt((spot.tx + 1) * TILE_SIZE, row);
  const floor = isFloor(world, spot.tx, row + 1) || isFloor(world, spot.tx + 1, row + 1);
  return floor && !overlapsSolid(world, at.x, at.y) ? at : null;
}

/**
 * Where to respawn: at the bed or the camp (top-left `camp`), whichever `prefer` says was set
 * last, if it's still whole with room to stand and a floor under it, or else at the other one;
 * otherwise on top of the ground in the nearest column to the world spawn (within
 * FALLBACK_SEARCH tiles) that has room to stand, which is open to the sky and so never inside
 * a sealed room; and as a last resort at the spawn point itself.
 */
export function findRespawn(world: World, bed: BedSpot | null, camp: BedSpot | null = null, prefer: RespawnChoice = 'bed'): RespawnPoint {
  const atBed = (): RespawnPoint | null => {
    const spot = bed && isWholeBed(world, bed.tx, bed.ty) ? restingSpot(world, bed, bed.ty) : null;
    return spot && { ...spot, atBed: true, atCamp: false };
  };
  const atCamp = (): RespawnPoint | null => {
    const spot = camp && isWholeCamp(world, camp.tx, camp.ty) ? restingSpot(world, camp, camp.ty + 1) : null;
    return spot && { ...spot, atBed: false, atCamp: true };
  };
  const found = prefer === 'camp' ? (atCamp() ?? atBed()) : (atBed() ?? atCamp());
  if (found) return found;
  for (let d = 0; d <= FALLBACK_SEARCH; d++) {
    for (const tx of d === 0 ? [world.spawnTx] : [world.spawnTx + d, world.spawnTx - d]) {
      if (!world.inBounds(tx, 0)) continue;
      let ty = 0;
      while (ty < world.height && !isSolid(world.getTile(tx, ty))) ty++;
      if (ty < 2 || ty >= world.height) continue;
      const spot = standingAt((tx + 0.5) * TILE_SIZE, ty - 1);
      if (!overlapsSolid(world, spot.x, spot.y)) return { ...spot, atBed: false, atCamp: false };
    }
  }
  return { ...standingAt((world.spawnTx + 0.5) * TILE_SIZE, world.spawnTy), atBed: false, atCamp: false };
}

/** Satchels from a save. Unknown items and impossible counts or positions are skipped. */
export function restoreSatchels(saved: unknown, world: World): Satchel[] {
  if (!Array.isArray(saved)) return [];
  const maxX = world.width * TILE_SIZE - SATCHEL_SIZE;
  const maxY = world.height * TILE_SIZE - SATCHEL_SIZE;
  const satchels: Satchel[] = [];
  for (const raw of saved) {
    const s = raw as Partial<Satchel> | null;
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !Array.isArray(s.stacks)) continue;
    const stacks = s.stacks
      .filter((st): st is ItemStack => !!st && st.item in ITEMS && Number.isInteger(st.count) && st.count > 0)
      .map((st) => ({ item: st.item as ItemId, count: st.count }));
    if (stacks.length > 0) satchels.push({ x: Math.min(Math.max(s.x!, 0), maxX), y: Math.min(Math.max(s.y!, 0), maxY), stacks });
  }
  return satchels;
}

/** The bed from a save, or null if it's missing or not a number pair. (Whether it's still a bed is checked when it's used.) */
export function restoreBed(saved: unknown, world: World): BedSpot | null {
  const b = saved as Partial<BedSpot> | null | undefined;
  if (!b || !Number.isInteger(b.tx) || !Number.isInteger(b.ty) || !world.inBounds(b.tx!, b.ty!)) return null;
  return { tx: b.tx!, ty: b.ty! };
}
