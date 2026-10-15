import { CRACK_STAGES, HINT_DURATION, PICKAXES, REACH, TILE_SIZE } from '../config';
import type { Player } from '../entities/player';
import { Tile, tileDef, type TileId } from '../world/tiles';
import type { World } from '../world/world';

/** Why a tile can or can't be mined right now. */
export type MineCheck = 'ok' | 'empty' | 'unbreakable' | 'far' | 'tier';

export interface Hint {
  text: string;
  /** World px, centre of the text. */
  x: number;
  y: number;
  timeLeft: number;
}

export interface BrokenTile {
  tx: number;
  ty: number;
  tile: TileId;
}

export interface Crack {
  tx: number;
  ty: number;
  /** 1..CRACK_STAGES */
  stage: number;
}

interface Damage {
  tx: number;
  ty: number;
  /** The tile that was damaged; if the world tile changes, the damage is stale. */
  tile: TileId;
  /** 0..1; the tile breaks at 1. */
  progress: number;
}

/** Is tile (tx, ty) within reach? Measured from the player's centre to the tile's centre. */
export function inReach(player: Player, tx: number, ty: number): boolean {
  const dx = (tx + 0.5) * TILE_SIZE - player.centerX;
  const dy = (ty + 0.5) * TILE_SIZE - player.centerY;
  return dx * dx + dy * dy <= (REACH * TILE_SIZE) ** 2;
}

export function checkMine(world: World, player: Player, tx: number, ty: number, tier: number): MineCheck {
  if (!world.inBounds(tx, ty)) return 'empty';
  const def = tileDef(world.getTile(tx, ty));
  if (def.id === Tile.Air) return 'empty';
  if (!Number.isFinite(def.hardness)) return 'unbreakable';
  if (!inReach(player, tx, ty)) return 'far';
  if (tier < def.minTier) return 'tier';
  return 'ok';
}

/** Crack overlay for a break progress: 0 = none, otherwise 1..CRACK_STAGES. */
export function crackStage(progress: number): number {
  return progress <= 0 ? 0 : Math.min(CRACK_STAGES, Math.floor(progress * CRACK_STAGES) + 1);
}

const keyOf = (tx: number, ty: number): number => ty * 65536 + tx;

/**
 * Break progress per tile. Damage stays on a tile when the cursor moves away, so the player
 * can come back and finish it.
 */
export class Mining {
  hint: Hint | null = null;
  private readonly damage = new Map<number, Damage>();

  /**
   * Advance one update step with the cursor on (tx, ty). `held` is the mine button. Returns
   * the tile that broke, if any; the world has already been updated. `instant` (debug mode)
   * breaks the tile this step, but reach and tier rules still apply.
   */
  update(
    dt: number,
    world: World,
    player: Player,
    tx: number,
    ty: number,
    held: boolean,
    tier: number,
    instant = false,
  ): BrokenTile | null {
    if (this.hint) {
      this.hint.timeLeft -= dt;
      if (this.hint.timeLeft <= 0) this.hint = null;
    }
    if (!held) return null;

    const check = checkMine(world, player, tx, ty, tier);
    if (check !== 'ok') {
      if (check === 'tier') this.showHint('Need better pickaxe', tx, ty);
      else if (check === 'far') this.showHint('Too far away', tx, ty);
      return null;
    }

    if (instant) return this.breakTile(world, tx, ty);
    const tile = world.getTile(tx, ty);
    const key = keyOf(tx, ty);
    let damage = this.damage.get(key);
    if (!damage || damage.tile !== tile) {
      damage = { tx, ty, tile, progress: 0 };
      this.damage.set(key, damage);
    }
    damage.progress += (dt * PICKAXES[tier].speed) / tileDef(tile).hardness;
    return damage.progress < 1 ? null : this.breakTile(world, tx, ty);
  }

  /** Debug mode: break (tx, ty) right now if the normal reach and tier rules allow it. No hints. */
  breakInstantly(world: World, player: Player, tx: number, ty: number, tier: number): BrokenTile | null {
    return checkMine(world, player, tx, ty, tier) === 'ok' ? this.breakTile(world, tx, ty) : null;
  }

  /** Break progress (0..1) of the tile at (tx, ty). */
  progressAt(world: World, tx: number, ty: number): number {
    const damage = this.damage.get(keyOf(tx, ty));
    return damage && damage.tile === world.getTile(tx, ty) ? damage.progress : 0;
  }

  /** Every damaged tile with its crack stage. Forgets damage on tiles that have since changed. */
  cracks(world: World): Crack[] {
    const result: Crack[] = [];
    for (const [key, d] of this.damage) {
      if (world.getTile(d.tx, d.ty) !== d.tile) this.damage.delete(key);
      else result.push({ tx: d.tx, ty: d.ty, stage: crackStage(d.progress) });
    }
    return result;
  }

  private breakTile(world: World, tx: number, ty: number): BrokenTile {
    const tile = world.getTile(tx, ty);
    this.damage.delete(keyOf(tx, ty));
    world.setTile(tx, ty, Tile.Air);
    return { tx, ty, tile };
  }

  private showHint(text: string, tx: number, ty: number): void {
    this.hint = { text, x: (tx + 0.5) * TILE_SIZE, y: ty * TILE_SIZE - 4, timeLeft: HINT_DURATION };
  }
}
