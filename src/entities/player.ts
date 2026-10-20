import {
  AIR_CONTROL,
  CLIMB_SIDE_SPEED,
  CLIMB_SPEED,
  COYOTE_TIME,
  DEBUG_FLY_FAST,
  DEBUG_FLY_SPEED,
  FLOAT_BRAKE,
  FLOAT_GRAVITY,
  FLOAT_MAX_FALL,
  GRAVITY,
  JUMP_BUFFER,
  JUMP_CORNER_CORRECTION,
  JUMP_CUT,
  LADDER_REGRAB_DELAY,
  MAX_FALL_SPEED,
  MAX_MOVE_STEP,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RUN_ACCEL,
  RUN_FRICTION,
  TILE_SIZE,
  WALK_OFF_CATCH_TILES,
  WALL_JUMP_PUSH,
  WALL_SLIDE_SPEED,
} from '../config';
import { computeStats, type PlayerStats } from '../systems/stats';
import { isClimbable, isFloor, isOneWayFloor, isSolid, Tile, type TileId } from '../world/tiles';
import type { World } from '../world/world';

/** One update step's worth of player intent, so physics doesn't depend on the DOM. */
export interface PlayerControls {
  /** -1 left, 0 none, 1 right. */
  move: number;
  /** Jump went down this step (Space, W or ↑). */
  jumpPressed: boolean;
  /** Jump is being held. */
  jumpHeld: boolean;
  /**
   * Up/down keys: -1 up (W/↑), 0 none, 1 down (S/↓). Climbs ladders; with jump, S drops down
   * through a platform. In debug fly mode it flies (jump also flies up).
   */
  climb?: number;
  /**
   * Careful walk (Shift): no auto step-up onto 1-tile ledges, so shaving off a layer of tiles
   * while walking doesn't lift the player onto it. It doesn't stop the player walking off ledges.
   */
  careful?: boolean;
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
  /**
   * Climbing claws (Phase 16): the side of the wall the player slid down or clung to during the
   * latest update (1 right, -1 left), or 0.
   */
  onWall: -1 | 0 | 1 = 0;
  /** Fall speed (px/s) if the latest update landed on the ground, else 0 (for sound and dust). */
  landingSpeed = 0;
  /** Holding on to a ladder: no gravity, W/S move up and down. */
  climbing = false;
  /** Vertical distance climbed on ladders, drives the rung sounds. */
  climbDistance = 0;
  /** Base stats plus gear and boons (see systems/stats.ts). */
  stats: PlayerStats = computeStats();
  /**
   * While in the air (not climbing or flying): the highest point (smallest y, world px) since
   * leaving the ground, so a fall is measured from the top of its arc. Null otherwise. Saved,
   * so reloading halfway down a shaft doesn't reset the fall.
   */
  fallTop: number | null = null;
  /** Tiles fallen if the latest update landed, else 0 (for fall damage). */
  fallLanded = 0;
  /** Caught on a ladder by walking into its shaft during the latest update. */
  caughtByLadder = false;
  /**
   * Near floatstone (Phase 14b; the game sets it before each update): gravity is FLOAT_GRAVITY
   * times as strong, falls are slower, and a fall only counts from where the player leaves it.
   */
  floating = false;
  /**
   * Left the ground by walking off a ledge (not by jumping, dropping through a platform or
   * letting go of a ladder). Walking off into a ladder column catches the player on it, once
   * they've fallen WALK_OFF_CATCH_TILES.
   */
  private walkedOff = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  /** Rising from a jump with the button still held (early release cuts the jump). */
  private jumpHeld = false;
  /** Seconds until a ladder can be grabbed again after letting go. */
  private regrabTimer = 0;
  /** The up/down key held when the player let go; holding it on doesn't grab again. */
  private heldWhenLetGo = 0;
  /** Row of the platform being dropped through (ignored as a floor until the feet pass it), or -1. */
  private dropRow = -1;
  /** The up/down key held during the previous update, so a fresh S press can be told apart. */
  private prevClimb = 0;
  /**
   * S has been held since it dropped the player through a platform: landing on another
   * platform drops through that too, until S is let go.
   */
  private dropChain = false;

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
    this.climbing = false;
    this.fallTop = null;
    this.walkedOff = false;
  }

  /**
   * Riding a lift cage (Phase 15): this step the player is wherever the cage puts them, at
   * (x, y) world px, with no physics. A ride is never a fall.
   */
  rideTo(x: number, y: number): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.climbing = false;
    this.jumped = false;
    this.landingSpeed = 0;
    this.fallTop = null;
    this.fallLanded = 0;
    this.walkedOff = false;
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
    this.fallLanded = 0;
    this.caughtByLadder = false;
    this.onWall = 0;
    const climb = controls.climb ?? 0;
    const downPressed = climb > 0 && this.prevClimb <= 0;
    this.prevClimb = climb;
    if (climb <= 0) this.dropChain = false;
    if (this.flying) {
      this.fly(dt, world, controls);
      this.fallTop = null;
      this.walkedOff = false;
      return;
    }

    // Ladders: W/S on one grabs it, and S on the top of one climbs down into it. A jump press
    // while climbing hops off (Space), or lets go and drops with S held; a W press is a climb.
    this.regrabTimer -= dt;
    if (climb !== this.heldWhenLetGo) this.heldWhenLetGo = 0;
    const canGrab = climb !== 0 && climb !== this.heldWhenLetGo && this.regrabTimer <= 0;
    // Walking off a ledge into a ladder shaft catches you on the ladder (jumping in doesn't), once
    // you've fallen a few tiles, so a small step down beside a ladder or rope doesn't latch on.
    const fallen = this.fallTop === null ? 0 : this.y - this.fallTop;
    const caught = !this.climbing && this.walkedOff && !this.grounded && fallen > WALK_OFF_CATCH_TILES * TILE_SIZE && this.onLadder(world);
    if (!this.climbing && ((canGrab && (this.onLadder(world) || (climb > 0 && this.onLadderTop(world)))) || caught)) {
      this.climbing = true;
      this.caughtByLadder = caught && !canGrab;
      this.vx = 0;
      // Line up with the ladder, so a one-tile shaft fits (the body may still be over the ground beside it).
      const centred = Math.floor(this.centerX / TILE_SIZE) * TILE_SIZE + (TILE_SIZE - W) / 2;
      if (!overlapsSolid(world, centred, this.y)) this.x = centred;
    }
    let hopped = false;
    if (this.climbing && controls.jumpPressed && climb >= 0) {
      this.letGo(climb);
      if (climb > 0) {
        this.dropRow = Math.floor((this.y + H + 0.5) / TILE_SIZE);
      } else {
        this.vy = -this.stats.jumpVelocity;
        this.jumpHeld = true;
        this.jumped = true;
        hopped = true;
      }
    }
    if (this.climbing) {
      this.dropChain = false;
      this.climbStep(dt, world, controls);
      this.fallTop = this.climbing || this.grounded ? null : this.y;
      this.walkedOff = false;
      return;
    }

    // Run: accelerate toward the target speed, or brake with friction.
    const control = this.grounded ? 1 : AIR_CONTROL;
    const rate = (controls.move !== 0 ? RUN_ACCEL : RUN_FRICTION) * control * dt;
    this.vx = approach(this.vx, controls.move * this.stats.runSpeed, rate);
    if (controls.move !== 0) this.facing = controls.move > 0 ? 1 : -1;

    // Pressing S on a platform drops down through it (S + jump too, instead of jumping), and
    // holding S keeps dropping through the platforms below. S held since before landing (from
    // a ladder, say) doesn't drop.
    let dropping = false;
    const dropAsked = downPressed || this.dropChain || controls.jumpPressed;
    if (this.grounded && climb > 0 && dropAsked && this.onPlatformOnly(world)) {
      dropping = true;
      this.dropChain = true;
      this.dropRow = Math.floor((this.y + H + 0.5) / TILE_SIZE);
      this.grounded = false;
    }

    // Jump, with coyote time and jump buffering.
    this.coyoteTimer = this.grounded ? COYOTE_TIME : dropping ? 0 : this.coyoteTimer - dt;
    this.jumpBufferTimer = controls.jumpPressed && !dropping && !hopped ? JUMP_BUFFER : this.jumpBufferTimer - dt;
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.vy = -this.stats.jumpVelocity;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.grounded = false;
      this.jumpHeld = true;
      this.jumped = true;
    }
    // Climbing claws: in the air, pushing against a wall grips it (S lets go). A jump press
    // without up leaps off it, away from the wall; with up (W is also jump) it clings.
    let wall = this.gripsWall(world, controls.move, climb, dropping);
    if (wall !== 0 && controls.jumpPressed && climb === 0 && !this.jumped) {
      this.vy = -this.stats.jumpVelocity;
      this.vx = -wall * WALL_JUMP_PUSH;
      this.facing = wall > 0 ? -1 : 1;
      this.jumpBufferTimer = 0;
      this.jumpHeld = true;
      this.jumped = true;
      wall = 0;
    }
    if (this.jumpHeld && (!controls.jumpHeld || this.vy >= 0)) {
      if (this.vy < 0) this.vy *= JUMP_CUT;
      this.jumpHeld = false;
    }

    // Near floatstone gravity is lighter and falls slower: a faster fall brakes down to that speed.
    const gravity = this.floating ? GRAVITY * FLOAT_GRAVITY : GRAVITY;
    const maxFall = this.floating ? MAX_FALL_SPEED * FLOAT_MAX_FALL : MAX_FALL_SPEED;
    this.vy = this.vy > maxFall ? Math.max(maxFall, this.vy - FLOAT_BRAKE * dt) : Math.min(this.vy + gravity * dt, maxFall);
    // On a wall: sliding down it slowly, or (holding up) clinging still.
    if (wall !== 0 && this.vy > 0) this.vy = climb < 0 ? 0 : Math.min(this.vy, WALL_SLIDE_SPEED);
    this.onWall = wall;

    // Move in small steps, X then Y, so even max speed can't skip over a tile.
    const dx = this.vx * dt;
    const dy = this.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_MOVE_STEP));
    const wasGrounded = this.grounded;
    const fallSpeed = this.vy;
    this.grounded = false;
    const startX = this.x;
    const canStep = wasGrounded && !controls.careful;
    for (let i = 0; i < steps; i++) {
      if (this.vx !== 0) this.moveX(dx / steps, world, canStep);
      if (this.vy !== 0) this.moveY(dy / steps, world, false, true);
    }
    // Once the feet are past the top of the platform being dropped through, it's a floor again.
    if (this.dropRow >= 0 && (this.grounded || this.y + H > this.dropRow * TILE_SIZE + 0.5)) this.dropRow = -1;
    if (this.grounded) this.walkDistance += Math.abs(this.x - startX);
    if (this.grounded && !wasGrounded) this.landingSpeed = fallSpeed;
    this.trackFall(wasGrounded, dropping || this.jumped);
    // Floatstone cushions falls: one only counts from where the player leaves its pull. A slide
    // down a wall is never a fall either: one only counts from where the player lets go.
    if ((this.floating || this.onWall !== 0) && this.fallTop !== null) this.fallTop = this.y;
  }

  /**
   * Climbing claws: the side of the wall (1 right, -1 left) the player grips this step, or 0.
   * Gripping needs the claws, the air (not just dropped through a platform), a move key pushing
   * against a solid tile right beside the body, and not holding down.
   */
  private gripsWall(world: World, move: number, climb: number, dropping: boolean): -1 | 0 | 1 {
    if (this.stats.wallGrip <= 0 || this.grounded || dropping || move === 0 || climb > 0) return 0;
    const dir = move > 0 ? 1 : -1;
    return overlapsSolid(world, this.x + dir, this.y) ? dir : 0;
  }

  /**
   * Measure falls: remember the top of the arc while airborne, and on landing set fallLanded to
   * the tiles fallen. Also notes whether the player walked off a ledge (see walkedOff).
   */
  private trackFall(wasGrounded: boolean, leftOnPurpose: boolean): void {
    if (this.grounded) {
      if (this.fallTop !== null) this.fallLanded = Math.max(0, (this.y - this.fallTop) / TILE_SIZE);
      this.fallTop = null;
      this.walkedOff = false;
      return;
    }
    if (leftOnPurpose) this.walkedOff = false;
    else if (wasGrounded) this.walkedOff = true;
    // The fall starts where the player was before this step if they were on the ground.
    const top = this.fallTop ?? (wasGrounded ? this.prevY : this.y);
    this.fallTop = Math.min(top, this.y, this.prevY);
  }

  /** The floor tile under the player's feet (under its centre if possible), or Air in the air. */
  groundTile(world: World): TileId {
    const row = Math.floor((this.y + H + 0.5) / TILE_SIZE);
    for (const x of [this.centerX, this.x + EPS, this.x + W - EPS]) {
      const col = Math.floor(x / TILE_SIZE);
      if (isFloor(world, col, row)) return world.getTile(col, row);
    }
    return Tile.Air;
  }

  /** Is any part of the player's centre column on a ladder tile? */
  onLadder(world: World): boolean {
    const col = Math.floor(this.centerX / TILE_SIZE);
    const row1 = Math.floor((this.y + H - EPS) / TILE_SIZE);
    for (let row = Math.floor(this.y / TILE_SIZE); row <= row1; row++) {
      if (isClimbable(world.getTile(col, row))) return true;
    }
    return false;
  }

  /** Standing on the top of a ladder (its centre column over the ladder)? */
  private onLadderTop(world: World): boolean {
    return this.grounded && isClimbable(world.getTile(Math.floor(this.centerX / TILE_SIZE), Math.floor((this.y + H + 0.5) / TILE_SIZE)));
  }

  /** Standing only on platforms or ladder tops, with no solid tile under the feet? */
  private onPlatformOnly(world: World): boolean {
    const row = Math.floor((this.y + H + 0.5) / TILE_SIZE);
    let platform = false;
    for (let col = Math.floor(this.x / TILE_SIZE); col <= Math.floor((this.x + W - EPS) / TILE_SIZE); col++) {
      if (isSolid(world.getTile(col, row))) return false;
      if (isOneWayFloor(world, col, row)) platform = true;
    }
    return platform;
  }

  /** Stop climbing. `climb` is the up/down key held at the time. */
  private letGo(climb: number): void {
    this.climbing = false;
    this.heldWhenLetGo = climb;
    this.regrabTimer = LADDER_REGRAB_DELAY;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  /**
   * One step on a ladder: no gravity, W/S climb, A/D shuffle slowly sideways. Stepping off the
   * ladder's column or climbing down onto the ground lets go.
   */
  private climbStep(dt: number, world: World, controls: PlayerControls): void {
    const climb = controls.climb ?? 0;
    this.vx = controls.move * CLIMB_SIDE_SPEED;
    this.vy = climb * CLIMB_SPEED;
    if (controls.move !== 0) this.facing = controls.move > 0 ? 1 : -1;
    this.jumpHeld = false;
    this.grounded = false;
    const dx = this.vx * dt;
    const dy = this.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_MOVE_STEP));
    const startY = this.y;
    for (let i = 0; i < steps; i++) {
      if (dx !== 0) this.moveX(dx / steps, world, false);
      if (dy !== 0) this.moveY(dy / steps, world, true, false);
    }
    this.climbDistance += Math.abs(this.y - startY);
    const standing = climb >= 0 && !overlapsSolid(world, this.x, this.y) && overlapsSolid(world, this.x, this.y + 1);
    if (!this.onLadder(world) || standing) {
      this.letGo(climb);
      this.grounded = standing;
      this.vy = 0;
    }
  }

  /** Turn debug fly mode on or off. Landing inside terrain lifts the player clear first. */
  setFlying(on: boolean, world: World): void {
    this.flying = on;
    this.climbing = false;
    this.fallTop = null;
    this.vx = 0;
    this.vy = 0;
    if (on) return;
    while (this.y > 0 && overlapsSolid(world, this.x, this.y)) this.y -= TILE_SIZE;
    this.prevY = this.y;
  }

  private fly(dt: number, world: World, controls: PlayerControls): void {
    const speed = DEBUG_FLY_SPEED * (controls.fast ? DEBUG_FLY_FAST : 1);
    this.vx = controls.move * speed;
    this.vy = (controls.climb || (controls.jumpHeld ? -1 : 0)) * speed;
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

  /**
   * Move down or up by dy, stopping at solid tiles. Moving down also lands on one-way floors
   * (platforms, ladder tops) that the feet started above, unless `ignoreOneWay` (climbing) or
   * it's the platform being dropped through. Moving up with `cornerCorrect`, a head that only
   * clips a ceiling edge on one side slides past it (see cornerCorrection).
   */
  private moveY(dy: number, world: World, ignoreOneWay: boolean, cornerCorrect: boolean): void {
    const feetBefore = this.y + H;
    this.y += dy;
    const row = dy > 0 ? Math.floor((this.y + H - EPS) / TILE_SIZE) : Math.floor(this.y / TILE_SIZE);
    const col0 = Math.floor(this.x / TILE_SIZE);
    const col1 = Math.floor((this.x + W - EPS) / TILE_SIZE);
    const oneWay = dy > 0 && !ignoreOneWay && row !== this.dropRow && feetBefore <= row * TILE_SIZE + EPS;
    for (let col = col0; col <= col1; col++) {
      if (!isSolid(world.getTile(col, row)) && !(oneWay && isOneWayFloor(world, col, row))) continue;
      if (dy > 0) {
        this.y = row * TILE_SIZE - H;
        this.grounded = true;
      } else if (cornerCorrect && this.cornerCorrection(world, row, col0, col1)) {
        return;
      } else {
        this.y = (row + 1) * TILE_SIZE;
      }
      this.vy = 0;
      return;
    }
  }

  /**
   * Jump corner correction: if the head (rising into `row`) overlaps a solid tile on one side
   * only, by at most JUMP_CORNER_CORRECTION px, shift sideways out of it and keep rising.
   * Returns false (no shift) for a head-on hit or if the shifted box would touch anything solid.
   */
  private cornerCorrection(world: World, row: number, col0: number, col1: number): boolean {
    if (col0 === col1) return false;
    const left = isSolid(world.getTile(col0, row));
    const right = isSolid(world.getTile(col1, row));
    if (left === right) return false;
    const x = left ? (col0 + 1) * TILE_SIZE : col1 * TILE_SIZE - W;
    if (Math.abs(x - this.x) > JUMP_CORNER_CORRECTION || overlapsSolid(world, x, this.y)) return false;
    this.x = x;
    return true;
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
