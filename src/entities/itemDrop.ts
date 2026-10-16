import {
  DROP_FRICTION,
  DROP_POP_SPEED,
  DROP_PULL_ACCEL,
  DROP_PULL_MAX_SPEED,
  DROP_SIZE,
  GRAVITY,
  MAX_FALL_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE_SIZE,
} from '../config';
import type { Inventory } from '../systems/inventory';
import type { ItemId } from '../systems/items';
import { isSolid } from '../world/tiles';
import type { World } from '../world/world';
import type { Player } from './player';

const S = DROP_SIZE;
const EPS = 1e-6;

/** An item lying in the world. Falls and rests on tiles; flies to the player when close. */
export class ItemDrop {
  readonly item: ItemId;
  count: number;
  /** Top-left corner, world px. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  /** Flying toward the player (ignores tiles). */
  pulled = false;
  /**
   * Set on stacks the player throws away: they aren't picked up again until the player has
   * been more than the player's drop pull range away from them once, so they stay where they were thrown.
   */
  waitForPlayerToLeave = false;

  constructor(item: ItemId, count: number, centerX: number, centerY: number) {
    this.item = item;
    this.count = count;
    this.x = this.prevX = centerX - S / 2;
    this.y = this.prevY = centerY - S / 2;
    this.vx = (Math.random() - 0.5) * DROP_POP_SPEED * 0.8;
    this.vy = -DROP_POP_SPEED;
  }

  /** Returns how many items were picked up this step. The drop is used up when count is 0. */
  update(dt: number, world: World, player: Player, inventory: Inventory): number {
    this.prevX = this.x;
    this.prevY = this.y;

    const dx = player.centerX - (this.x + S / 2);
    const dy = player.centerY - (this.y + S / 2);
    const dist = Math.hypot(dx, dy);
    const pullRange = player.stats.dropPullRange * TILE_SIZE;
    if (dist > pullRange) this.waitForPlayerToLeave = false;
    const room = !this.waitForPlayerToLeave && inventory.canAdd(this.item);
    if (!room) this.pulled = false;
    else if (dist < pullRange) this.pulled = true;

    if (this.pulled && dist > 0) {
      const speed = Math.min(Math.hypot(this.vx, this.vy) + DROP_PULL_ACCEL * dt, DROP_PULL_MAX_SPEED);
      this.vx = (dx / dist) * speed;
      this.vy = (dy / dist) * speed;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    } else {
      this.fall(dt, world);
    }

    if (room && this.touches(player)) {
      const before = this.count;
      this.count = inventory.add(this.item, this.count);
      if (this.count > 0) this.pulled = false;
      return before - this.count;
    }
    return 0;
  }

  private fall(dt: number, world: World): void {
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL_SPEED);

    this.x += this.vx * dt;
    if (boxHitsSolid(world, this.x, this.y)) {
      this.x = this.vx > 0 ? Math.floor((this.x + S - EPS) / TILE_SIZE) * TILE_SIZE - S : (Math.floor(this.x / TILE_SIZE) + 1) * TILE_SIZE;
      this.vx = 0;
    }

    this.y += this.vy * dt;
    if (boxHitsSolid(world, this.x, this.y)) {
      if (this.vy > 0) {
        this.y = Math.floor((this.y + S - EPS) / TILE_SIZE) * TILE_SIZE - S;
        const slow = DROP_FRICTION * dt;
        this.vx = Math.abs(this.vx) <= slow ? 0 : this.vx - Math.sign(this.vx) * slow;
      } else {
        this.y = (Math.floor(this.y / TILE_SIZE) + 1) * TILE_SIZE;
      }
      this.vy = 0;
    }
  }

  private touches(player: Player): boolean {
    return (
      this.x < player.x + PLAYER_WIDTH &&
      this.x + S > player.x &&
      this.y < player.y + PLAYER_HEIGHT &&
      this.y + S > player.y
    );
  }
}

/** Update every drop and return the ones still lying around. `onPickup` hears about each pickup. */
export function updateDrops(
  drops: ItemDrop[],
  dt: number,
  world: World,
  player: Player,
  inventory: Inventory,
  onPickup?: (item: ItemId, count: number) => void,
): ItemDrop[] {
  return drops.filter((drop) => {
    const picked = drop.update(dt, world, player, inventory);
    if (picked > 0) onPickup?.(drop.item, picked);
    return drop.count > 0;
  });
}

function boxHitsSolid(world: World, x: number, y: number): boolean {
  const col0 = Math.floor(x / TILE_SIZE);
  const col1 = Math.floor((x + S - EPS) / TILE_SIZE);
  const row0 = Math.floor(y / TILE_SIZE);
  const row1 = Math.floor((y + S - EPS) / TILE_SIZE);
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      if (isSolid(world.getTile(col, row))) return true;
    }
  }
  return false;
}
