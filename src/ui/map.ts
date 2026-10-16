import { MAP_FOG_COLOR, MAP_PAN_SPEED, MAP_ZOOM_START, MAP_ZOOMS, MINIMAP_HEIGHT, MINIMAP_WIDTH, TILE_SIZE } from '../config';
import type { MapImage } from '../render/mapImage';
import { mapHelpText } from './controls';
import { shadowText } from './hud';

// The full-screen map (M) and the corner minimap (N), both drawn from the MapImage. Sizes are
// in UI units: `u` screen pixels each, the game's pixel scale.

/** Things marked on the map. */
export interface MapMarkers {
  /** Player centre, world px. */
  playerX: number;
  playerY: number;
  spawn: { tx: number; ty: number };
  chests: { tx: number; ty: number }[];
  /** The bed the player respawns at (its left tile), if any. */
  bed: { tx: number; ty: number } | null;
  /** Satchels left where the player died (tile coordinates, fractional). Drawn as diamonds. */
  satchels: { tx: number; ty: number }[];
}

/** One update step of input for the open map. */
export interface MapInput {
  /** Mouse wheel notches (positive = scrolled down = zoom out). */
  wheel: number;
  /** Pointer, canvas px. */
  mouseX: number;
  mouseY: number;
  /** Left button held (dragging pans). */
  dragging: boolean;
  /** -1, 0 or 1 per axis, from WASD or the arrow keys. */
  panX: number;
  panY: number;
}

const PLAYER_COLOR = '#ffe066';
const SPAWN_COLOR = '#7cd65a';
const CHEST_COLOR = '#d08a3c';
const BED_COLOR = '#ff7eb6';
const SATCHEL_COLOR = '#c792ff';

export class FullMap {
  open = false;
  /** Tile coordinates (fractional) at the centre of the screen. */
  private cx = 0;
  private cy = 0;
  private zoom = MAP_ZOOM_START;
  /** Pointer position at the last step of a drag, or null when not dragging. */
  private dragFrom: { x: number; y: number } | null = null;

  /** Open the map centred on the player (world px). */
  show(playerX: number, playerY: number): void {
    this.open = true;
    this.cx = playerX / TILE_SIZE;
    this.cy = playerY / TILE_SIZE;
    this.zoom = MAP_ZOOM_START;
    this.dragFrom = null;
  }

  /** Pan and zoom for one update step. (width, height) is the canvas size; u the pixel scale. */
  update(dt: number, input: MapInput, width: number, height: number, u: number, worldWidth: number, worldHeight: number): void {
    // Zoom about the pointer: the tile under it stays put.
    if (input.wheel !== 0) {
      const before = this.pxPerTile(u);
      const mx = (input.mouseX - width / 2) / before;
      const my = (input.mouseY - height / 2) / before;
      this.zoom = Math.max(0, Math.min(MAP_ZOOMS.length - 1, this.zoom - Math.sign(input.wheel)));
      const after = this.pxPerTile(u);
      this.cx += mx - (input.mouseX - width / 2) / after;
      this.cy += my - (input.mouseY - height / 2) / after;
    }
    const scale = this.pxPerTile(u);
    if (input.dragging) {
      if (this.dragFrom) {
        this.cx -= (input.mouseX - this.dragFrom.x) / scale;
        this.cy -= (input.mouseY - this.dragFrom.y) / scale;
      }
      this.dragFrom = { x: input.mouseX, y: input.mouseY };
    } else {
      this.dragFrom = null;
    }
    this.cx += (input.panX * MAP_PAN_SPEED * u * dt) / scale;
    this.cy += (input.panY * MAP_PAN_SPEED * u * dt) / scale;
    this.cx = Math.max(0, Math.min(worldWidth, this.cx));
    this.cy = Math.max(0, Math.min(worldHeight, this.cy));
  }

  draw(ctx: CanvasRenderingContext2D, image: MapImage, markers: MapMarkers, u: number): void {
    const { width, height } = ctx.canvas;
    const scale = this.pxPerTile(u);
    // Screen position of tile (tx, ty)'s top-left corner.
    const sx = (tx: number): number => Math.round(width / 2 + (tx - this.cx) * scale);
    const sy = (ty: number): number => Math.round(height / 2 + (ty - this.cy) * scale);
    image.flush();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.fillRect(0, 0, width, height);
    const x0 = sx(0);
    const y0 = sy(0);
    const w = sx(image.canvas.width) - x0;
    const h = sy(image.canvas.height) - y0;
    ctx.fillStyle = MAP_FOG_COLOR;
    ctx.fillRect(x0, y0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image.canvas, x0, y0, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = Math.max(1, u / 2);
    ctx.strokeRect(x0, y0, w, h);

    const size = Math.max(3 * u, scale);
    for (const chest of markers.chests) marker(ctx, sx(chest.tx + 0.5), sy(chest.ty + 0.5), size, CHEST_COLOR, u);
    marker(ctx, sx(markers.spawn.tx + 0.5), sy(markers.spawn.ty + 0.5), size, SPAWN_COLOR, u);
    if (markers.bed) marker(ctx, sx(markers.bed.tx + 1), sy(markers.bed.ty + 0.5), size, BED_COLOR, u);
    for (const satchel of markers.satchels) diamond(ctx, sx(satchel.tx), sy(satchel.ty), size * 1.4, SATCHEL_COLOR, u);
    marker(ctx, sx(markers.playerX / TILE_SIZE), sy(markers.playerY / TILE_SIZE), size * 1.4, PLAYER_COLOR, u);

    ctx.font = `${8 * u}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    shadowText(ctx, 'Map', width / 2, 8 * u, '#fff', u);
    ctx.font = `${5 * u}px monospace`;
    shadowText(ctx, mapHelpText(), width / 2, 19 * u, '#b8b8c8', u);
    drawLegend(ctx, width / 2, height - 12 * u, u, markers);
    ctx.restore();
  }

  private pxPerTile(u: number): number {
    return MAP_ZOOMS[this.zoom] * u;
  }
}

/** A diamond marker centred on (x, y) screen px, with a dark outline (satchels). */
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, u: number): void {
  const r = Math.round(size / 2);
  const edge = Math.max(1, Math.round(u / 2));
  const path = (radius: number): void => {
    ctx.beginPath();
    ctx.moveTo(Math.round(x), Math.round(y) - radius);
    ctx.lineTo(Math.round(x) + radius, Math.round(y));
    ctx.lineTo(Math.round(x), Math.round(y) + radius);
    ctx.lineTo(Math.round(x) - radius, Math.round(y));
    ctx.closePath();
  };
  ctx.fillStyle = '#000';
  path(r + 2 * edge);
  ctx.fill();
  ctx.fillStyle = color;
  path(r);
  ctx.fill();
}

/** A square marker centred on (x, y) screen px, with a dark outline. */
function marker(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, u: number): void {
  const s = Math.round(size);
  const left = Math.round(x - s / 2);
  const top = Math.round(y - s / 2);
  const edge = Math.max(1, Math.round(u / 2));
  ctx.fillStyle = '#000';
  ctx.fillRect(left - edge, top - edge, s + 2 * edge, s + 2 * edge);
  ctx.fillStyle = color;
  ctx.fillRect(left, top, s, s);
}

function drawLegend(ctx: CanvasRenderingContext2D, cx: number, y: number, u: number, markers: MapMarkers): void {
  const items: [string, string][] = [
    [PLAYER_COLOR, 'You'],
    [SPAWN_COLOR, 'Spawn'],
    [CHEST_COLOR, 'Chest'],
  ];
  if (markers.bed) items.push([BED_COLOR, 'Bed']);
  if (markers.satchels.length > 0) items.push([SATCHEL_COLOR, 'Satchel']);
  ctx.font = `${5 * u}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const gap = 10 * u;
  const widths = items.map(([, label]) => 6 * u + ctx.measureText(label).width);
  let x = cx - (widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1)) / 2;
  items.forEach(([color, label], i) => {
    if (color === SATCHEL_COLOR) diamond(ctx, x + 2 * u, y, 4 * u, color, u);
    else marker(ctx, x + 2 * u, y, 3 * u, color, u);
    shadowText(ctx, label, x + 6 * u, y, '#d6d6d6', u);
    x += widths[i] + gap;
  });
}

/**
 * Minimap in the top-right corner, under the depth meter: MINIMAP_WIDTH x MINIMAP_HEIGHT tiles
 * around the player, one UI unit per tile.
 */
export function drawMinimap(ctx: CanvasRenderingContext2D, image: MapImage, markers: MapMarkers, u: number): void {
  const { width } = ctx.canvas;
  const w = MINIMAP_WIDTH * u;
  const h = MINIMAP_HEIGHT * u;
  const x0 = width - 8 * u - w;
  const y0 = 20 * u;
  // Tile at the minimap's top-left corner (whole tiles, so pixels stay crisp).
  const left = Math.round(markers.playerX / TILE_SIZE - MINIMAP_WIDTH / 2);
  const top = Math.round(markers.playerY / TILE_SIZE - MINIMAP_HEIGHT / 2);
  image.flush();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(x0 - u, y0 - u, w + 2 * u, h + 2 * u);
  ctx.fillStyle = MAP_FOG_COLOR;
  ctx.fillRect(x0, y0, w, h);
  // Only the part of the view that's inside the world (drawImage can't take an off-image source).
  const sx0 = Math.max(0, left);
  const sy0 = Math.max(0, top);
  const sx1 = Math.min(image.canvas.width, left + MINIMAP_WIDTH);
  const sy1 = Math.min(image.canvas.height, top + MINIMAP_HEIGHT);
  ctx.imageSmoothingEnabled = false;
  if (sx1 > sx0 && sy1 > sy0) {
    ctx.drawImage(image.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, x0 + (sx0 - left) * u, y0 + (sy0 - top) * u, (sx1 - sx0) * u, (sy1 - sy0) * u);
  }
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  const at = (t: number, origin: number, screen: number): number => screen + (t + 0.5 - origin) * u;
  for (const chest of markers.chests) marker(ctx, at(chest.tx, left, x0), at(chest.ty, top, y0), 2 * u, CHEST_COLOR, u);
  marker(ctx, at(markers.spawn.tx, left, x0), at(markers.spawn.ty, top, y0), 2 * u, SPAWN_COLOR, u);
  if (markers.bed) marker(ctx, at(markers.bed.tx + 0.5, left, x0), at(markers.bed.ty, top, y0), 2 * u, BED_COLOR, u);
  for (const satchel of markers.satchels) {
    diamond(ctx, x0 + (satchel.tx - left) * u, y0 + (satchel.ty - top) * u, 3 * u, SATCHEL_COLOR, u);
  }
  marker(ctx, x0 + (markers.playerX / TILE_SIZE - left) * u, y0 + (markers.playerY / TILE_SIZE - top) * u, 3 * u, PLAYER_COLOR, u);
  ctx.restore();
}
