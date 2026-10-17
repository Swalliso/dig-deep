import type { DreadStatus } from '../systems/dread';
import { shadowText } from './hud';

// Health on the HUD (hearts, the protection bar, the way back to a satchel) and the death
// screen. Sizes are in UI units: `u` screen pixels each, the game's pixel scale.

// A 7 x 6 heart, one character per pixel.
const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const HEART_W = 7;
const HEART_GAP = 2;
const FULL = '#e2453c';
const EMPTY = '#3b2b2e';
const OUTLINE = '#000';
/** Outline while protected: a shape cue that doesn't rely on blinking. */
const PROTECTED_OUTLINE = '#dfe6ff';
const PROTECTION_BAR = '#b9c6ff';

export interface HeartsView {
  hp: number;
  maxHp: number;
  /** 0..1 of hurt/respawn protection left (0 when not protected). */
  protection: number;
  /** Hearts lost by the latest hit shake: HP before it, and 0..1 of the shake left. */
  shakeFrom: number;
  shake: number;
}

/**
 * Hearts in the top-left corner (2 HP each, so half hearts show odd HP), outlined in light blue
 * with a shrinking bar under them while damage is ignored. Returns the y (screen px) below them.
 */
export function drawHearts(ctx: CanvasRenderingContext2D, view: HeartsView, u: number): number {
  const x0 = 6 * u;
  const y0 = 6 * u;
  const hearts = Math.ceil(view.maxHp / 2);
  const protectedNow = view.protection > 0;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < hearts; i++) {
    // HP covered by this heart: 2i+1 is its left half, 2i+2 its right half.
    const lost = view.shake > 0 && view.hp < 2 * i + 2 && view.shakeFrom > 2 * i;
    const jiggle = lost ? Math.round(Math.sin(view.shake * 40) * view.shake * 2) * u : 0;
    const left = x0 + i * (HEART_W + HEART_GAP) * u + jiggle;
    drawHeart(ctx, left, y0, u, view.hp >= 2 * i + 1, view.hp >= 2 * i + 2, protectedNow);
  }
  let bottom = y0 + 7 * u;
  if (protectedNow) {
    const width = hearts * (HEART_W + HEART_GAP) * u - HEART_GAP * u;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x0, bottom + u, width, 2 * u);
    ctx.fillStyle = PROTECTION_BAR;
    ctx.fillRect(x0, bottom + u, Math.round(width * Math.min(1, view.protection)), 2 * u);
    bottom += 3 * u;
  }
  ctx.restore();
  return bottom + 2 * u;
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, leftFull: boolean, rightFull: boolean, protectedNow: boolean): void {
  // Outline: the shape drawn a unit bigger all round, then the heart on top.
  ctx.fillStyle = protectedNow ? PROTECTED_OUTLINE : OUTLINE;
  HEART.forEach((row, py) => {
    for (let px = 0; px < row.length; px++) if (row[px] === 'X') ctx.fillRect(x + (px - 1) * u, y + (py - 1) * u, 3 * u, 3 * u);
  });
  HEART.forEach((row, py) => {
    for (let px = 0; px < row.length; px++) {
      if (row[px] !== 'X') continue;
      const full = px < 4 ? leftFull : rightFull;
      ctx.fillStyle = full ? FULL : EMPTY;
      ctx.fillRect(x + px * u, y + py * u, u, u);
    }
  });
  // A highlight on full hearts.
  if (leftFull) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(x + u, y + u, u, u);
  }
}

const DREAD_COLORS: Record<DreadStatus['tone'], string> = {
  danger: '#ff8a80',
  warning: '#d7b8ff',
  carried: '#ffd98a',
  safe: '#cfe8c8',
};

/**
 * The dread meter under the hearts: a bar that fills purple, turning red and pulsing with the
 * heartbeat (`pulse`, 0..1) when full, then the status line saying how things stand and why.
 * Returns the y (screen px) below it.
 */
export function drawDreadMeter(ctx: CanvasRenderingContext2D, level: number, status: DreadStatus | null, pulse: number, y: number, u: number): number {
  const x0 = 6 * u;
  const width = 43 * u;
  const full = level >= 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const grow = full ? Math.round(pulse * u) : 0;
  ctx.fillStyle = full ? '#ff8a80' : '#000';
  ctx.fillRect(x0 - u - grow, y - u - grow, width + 2 * u + 2 * grow, 5 * u + 2 * grow);
  ctx.fillStyle = '#241c2e';
  ctx.fillRect(x0, y, width, 3 * u);
  ctx.fillStyle = full ? '#c03a52' : '#9b6bd6';
  ctx.fillRect(x0, y, Math.round(width * Math.min(1, level)), 3 * u);
  // Ticks at quarters, so the level reads without relying on color.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  for (let i = 1; i < 4; i++) ctx.fillRect(x0 + Math.round((width * i) / 4), y, u, 3 * u);
  ctx.font = `${6 * u}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  shadowText(ctx, 'Dread', x0 + width + 4 * u, y - 2 * u, full ? '#ff8a80' : '#d7b8ff', u);
  ctx.restore();
  let bottom = y + 7 * u;
  if (status) bottom = drawHudLine(ctx, status.text, bottom, u, DREAD_COLORS[status.tone]);
  return bottom;
}

/** One short line of HUD text at (6u, y), e.g. "Cozy world" or the way to a satchel. Returns the y below it. */
export function drawHudLine(ctx: CanvasRenderingContext2D, text: string, y: number, u: number, color = '#fff'): number {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${6 * u}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  shadowText(ctx, text, 6 * u, y, color, u);
  ctx.restore();
  return y + 9 * u;
}

const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

/** "Satchel 34 m ↘": how far and which way a point (dx, dy tiles from the player) is. */
export function directionText(label: string, dx: number, dy: number): string {
  const distance = Math.round(Math.hypot(dx, dy));
  if (distance < 2) return `${label} here`;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return `${label} ${distance} m ${ARROWS[(octant + 8) % 8]}`;
}

/** "23 m right and 40 m down" from (dx, dy) tiles. */
export function offsetText(dx: number, dy: number): string {
  const parts: string[] = [];
  if (Math.round(dx) !== 0) parts.push(`${Math.abs(Math.round(dx))} m ${dx > 0 ? 'right' : 'left'}`);
  if (Math.round(dy) !== 0) parts.push(`${Math.abs(Math.round(dy))} m ${dy > 0 ? 'down' : 'up'}`);
  return parts.length > 0 ? parts.join(' and ') : 'right here';
}

/** A dark red overlay with lines of text, the first one big. */
export function drawDeathScreen(ctx: CanvasRenderingContext2D, lines: string[], prompt: string | null, u: number): void {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(30, 4, 6, 0.72)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = Math.round(height * 0.28);
  ctx.font = `bold ${16 * u}px monospace`;
  shadowText(ctx, 'You died', width / 2, y, '#ff8a80', u);
  y += 24 * u;
  ctx.font = `${7 * u}px monospace`;
  for (const line of lines) {
    shadowText(ctx, line, width / 2, y, '#f2e6e6', u);
    y += 11 * u;
  }
  if (prompt) {
    y += 8 * u;
    shadowText(ctx, prompt, width / 2, y, '#ffe066', u);
  }
  ctx.restore();
}
