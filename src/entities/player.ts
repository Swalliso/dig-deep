import {
  AIR_CONTROL,
  COYOTE_TIME,
  DEBUG_FLY_FAST,
  DEBUG_FLY_SPEED,
  GRAVITY,
  JUMP_BUFFER,
  JUMP_CUT,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  MAX_MOVE_STEP,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RUN_ACCEL,
  RUN_FRICTION,
  RUN_SPEED,
  TILE_SIZE,
} from '../config';
import { isSolid, Tile, type TileId } from '../world/tiles';
import type { World } from '../world/world';

/** One update step's worth of player intent, so physics doesn't depend on the DOM. */
export interface PlayerControls {
  /** -1 left, 0 none, 1 right. */
  move: number;
  /** Jump went down this step. */
  jumpPressed: boolean;
  /** Jump is being held. */
  jumpHeld: boolean;
  /** Debug fly mode only: -1 up, 0 none, 1 down. */
  climb?: number;
  /** Debug fly mode only: move faster. */
  fast?: boolean;
}

// Keeps a box's far edge out of the next tile when it sits exactly on a tile boundary.
const EPS = 1e-6;

const W = PLAYER_WIDTH;
const H = PLAYER_HEIGHT;

/** Axis-aligned box that runs, jumps and falls with tile collision. */
export class Player {
  /** Top-left corner, world px. */
  x: number;
  y: number;
  /** Position before the latest update, for render interpolation. */
  prevX: number;
  prevY: number;
  vx = 0;
  vy = 0;
  grounded = false;
  facing: 1 | -1 = 1;
  /** Horizontal distance walked on the ground, drives the walk animation. */
  walkDistance = 0;
  /** Debug fly mode: free movement with no gravity or collision. Toggle with setFlying. */
  flying = false;
  /** A jump started during the latest update (for its sound). */
  jumped = false;
  /** Fall speed (px/s) if the latest update landed on the ground, else 0 (for sound and dust). */
  landingSpeed = 0;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  /** Rising from a jump with the button still held (early release cuts the jump). */
  private jumpHeld = false;

  /** Place the player standing on the tile row below (tx, ty). */
  constructor(tx: number, ty: number) {
    this.x = tx * TILE_SIZE + (TILE_SIZE - W) / 2;
    this.y = (ty + 1) * TILE_SIZE - H;
    this.prevX = this.x;
    this.prevY = this.y;
  }

  /** Put the player's top-left at (x, y) world px, at rest. */
  placeAt(x: number, y: number): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vx = 0;
    this.vy = 0;
  }

  get centerX(): number {
    return this.x + W / 2;
  }

  get centerY(): number {
    return this.y + H / 2;
  }

  update(dt: number, world: World, controls: PlayerControls): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.jumped = false;
    this.landingSpeed = 0;
    if (this.flying) {
      this.fly(dt, world, controls);
      return;
    }

    // Run: accelerate toward the target speed, or brake with friction.
    const control = this.grounded ? 1 : AIR_CONTROL;
    const rate = (controls.move !== 0 ? RUN_ACCEL : RUN_FRICTION) * control * dt;
    this.vx = approach(this.vx, controls.move * RUN_SPEED, rate);
    if (controls.move !== 0) this.facing = controls.move > 0 ? 1 : -1;

    // Jump, with coyote time and jump buffering.
    this.coyoteTimer = this.grounded ? COYOTE_TIME : this.coyoteTimer - dt;
    this.jumpBufferTimer = controls.jumpPressed ? JUMP_BUFFER : this.jumpBufferTimer - dt;
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.vy = -JUMP_VELOCITY;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.grounded = false;
      this.jumpHeld = true;
      this.jumped = true;
    }
    if (this.jumpHeld && (!controls.jumpHeld || this.vy >= 0)) {
      if (this.vy < 0) this.vy *= JUMP_CUT;
      this.jumpHeld = false;
    }

    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL_SPEED);

    // Move in small steps, X then Y, so even max speed can't skip over a tile.
    const dx = this.vx * dt;
    const dy = this.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_MOVE_STEP));
    const wasGrounded = this.grounded;
    const fallSpeed = this.vy;
    this.grounded = false;
    const startX = this.x;
    for (let i = 0; i < steps; i++) {
      if (this.vx !== 0) this.moveX(dx / steps, world, wasGrounded);
      if (this.vy !== 0) this.moveY(dy / steps, world);
    }
    if (this.grounded) this.walkDistance += Math.abs(this.x - startX);
    if (this.grounded && !wasGrounded) this.landingSpeed = fallSpeed;
  }

  /** The solid tile under the player's feet (under its centre if possible), or Air in the air. */
  groundTile(world: World): TileId {
    const row = Math.floor((this.y + H + 0.5) / TILE_SIZE);
    for (const x of [this.centerX, this.x + EPS, this.x + W - EPS]) {
      const tile = world.getTile(Math.floor(x / TILE_SIZE), row);
      if (isSolid(tile)) return tile;
    }
    return Tile.Air;
  }

  /** Turn debug fly mode on or off. Landing inside terrain lifts the player clear first. */
  setFlying(on: boolean, world: World): void {
    this.flying = on;
    this.vx = 0;
    this.vy = 0;
    if (on) return;
    while (this.y > 0 && overlapsSolid(world, this.x, this.y)) this.y -= TILE_SIZE;
    this.prevY = this.y;
  }

  private fly(dt: number, world: World, controls: PlayerControls): void {
    const speed = DEBUG_FLY_SPEED * (controls.fast ? DEBUG_FLY_FAST : 1);
    this.vx = controls.move * speed;
    this.vy = (controls.climb ?? 0) * speed;
    if (controls.move !== 0) this.facing = controls.move > 0 ? 1 : -1;
    this.x = Math.min(Math.max(this.x + this.vx * dt, 0), world.width * TILE_SIZE - W);
    this.y = Math.min(Math.max(this.y + this.vy * dt, 0), world.height * TILE_SIZE - H);
    this.grounded = false;
  }

  private moveX(dx: number, world: World, canStep: boolean): void {
    this.x += dx;
    const col = dx > 0 ? Math.floor((this.x + W - EPS) / TILE_SIZE) : Math.floor(this.x / TILE_SIZE);
    const row0 = Math.floor(this.y / TILE_SIZE);
    const row1 = Math.floor((this.y + H - EPS) / TILE_SIZE);
    let blocked = false;
    for (let row = row0; row <= row1; row++) {
      if (isSolid(world.getTile(col, row))) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return;

    // Auto step-up: walking into a 1-tile ledge lifts the player onto it.
    if (canStep) {
      const stepY = row1 * TILE_SIZE - H;
      if (this.y - stepY <= TILE_SIZE && !overlapsSolid(world, this.x, stepY)) {
        this.y = stepY;
        return;
      }
    }

    this.x = dx > 0 ? col * TILE_SIZE - W : (col + 1) * TILE_SIZE;
    this.vx = 0;
  }

  private moveY(dy: number, world: World): void {
    this.y += dy;
    const row = dy > 0 ? Math.floor((this.y + H - EPS) / TILE_SIZE) : Math.floor(this.y / TILE_SIZE);
    const col0 = Math.floor(this.x / TILE_SIZE);
    const col1 = Math.floor((this.x + W - EPS) / TILE_SIZE);
    for (let col = col0; col <= col1; col++) {
      if (!isSolid(world.getTile(col, row))) continue;
      if (dy > 0) {
        this.y = row * TILE_SIZE - H;
        this.grounded = true;
      } else {
        this.y = (row + 1) * TILE_SIZE;
      }
      this.vy = 0;
      return;
    }
  }
}

/** Does a player-sized box with its top-left at (x, y) touch any solid tile? */
export function overlapsSolid(world: World, x: number, y: number): boolean {
  const col0 = Math.floor(x / TILE_SIZE);
  const col1 = Math.floor((x + W - EPS) / TILE_SIZE);
  const row0 = Math.floor(y / TILE_SIZE);
  const row1 = Math.floor((y + H - EPS) / TILE_SIZE);
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      if (isSolid(world.getTile(col, row))) return true;
    }
  }
  return false;
}

function approach(value: number, target: number, maxDelta: number): number {
  return value < target ? Math.min(value + maxDelta, target) : Math.max(value - maxDelta, target);
}
