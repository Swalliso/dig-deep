import * as sfx from '../audio/sfx';
import {
  MAP_FOG_COLOR,
  MAP_PAN_SPEED,
  MAP_PIN_HIT,
  MAP_PIN_MAX,
  MAP_PIN_NAME_MAX,
  MAP_ZOOM_START,
  MAP_ZOOMS,
  MINIMAP_HEIGHT,
  MINIMAP_WIDTH,
  TILE_SIZE,
} from '../config';
import { startTyping, stopTyping, typedText } from '../input';
import type { MapImage } from '../render/mapImage';
import type { MapPin, MapPins } from '../systems/mapPins';
import type { ExploredMap } from '../world/explored';
import { mapHelpText, pinEditorHelp } from './controls';
import { shadowText } from './hud';

// The full-screen map (M) and the corner minimap (N), both drawn from the MapImage. Sizes are
// in UI units: `u` screen pixels each, the game's pixel scale. On the full map, right-click adds
// a pin (or picks one) and opens the pin editor along the bottom: type a name, track the pin on
// the HUD, or delete it.

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
  /** The Heart of the Deep, once the player has seen it (Phase 14b), or null. Drawn as a diamond. */
  heart: { tx: number; ty: number } | null;
  /** The camp, by its top-left tile, or null (Phase 15). */
  camp: { tx: number; ty: number } | null;
  /** Lift stops and their names (Phase 15); the full map labels them. */
  liftStops: { tx: number; ty: number; name: string }[];
  /** The player's map pins, and the index of the tracked one (or null). */
  pins: readonly MapPin[];
  trackedPin: number | null;
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
  /** The left button went down this step (a click on the pin editor, or the start of a drag). */
  clicked: boolean;
  /** The pin button (right-click) went down this step. */
  pin: boolean;
  /** While a pin name is being typed: keep it (Enter), or stop without renaming (Esc). */
  confirm: boolean;
  cancel: boolean;
}

/** The pins the map adds to and edits, and the explored tiles they must be on. */
export interface PinContext {
  pins: MapPins;
  explored: ExploredMap;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type EditorButton = 'track' | 'delete' | 'done';

/** The pin editor box and its buttons, screen px. */
interface EditorLayout {
  box: Rect;
  buttons: { id: EditorButton; rect: Rect }[];
}

const EDITOR_W = 170;
const EDITOR_H = 40;
const EDITOR_BUTTONS: { id: EditorButton; w: number }[] = [
  { id: 'track', w: 64 },
  { id: 'delete', w: 34 },
  { id: 'done', w: 30 },
];

const hit = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

const PLAYER_COLOR = '#ffe066';
const SPAWN_COLOR = '#7cd65a';
const CHEST_COLOR = '#d08a3c';
const BED_COLOR = '#ff7eb6';
const SATCHEL_COLOR = '#c792ff';
const HEART_COLOR = '#ff3d5a';
const CAMP_COLOR = '#ffa64d';
const LIFT_COLOR = '#e0e4ea';
export const PIN_COLOR = '#5ad1e6';
/** The tracked pin, on the map, the minimap and the HUD. */
export const TRACKED_PIN_COLOR = '#ffffff';
/** How long a note on the map (why a pin couldn't be added) stays up, in ms (real time: the map is a menu). */
const NOTICE_MS = 2500;

export class FullMap {
  open = false;
  /** Index of the pin being edited (its name is being typed), or null. */
  editing: number | null = null;
  /** Tile coordinates (fractional) at the centre of the screen. */
  private cx = 0;
  private cy = 0;
  private zoom = MAP_ZOOM_START;
  /** Pointer position at the last step of a drag, or null when not dragging. */
  private dragFrom: { x: number; y: number } | null = null;
  /** The left button went down on the pin editor, so holding it doesn't drag the map. */
  private pressOnEditor = false;
  private notice: { text: string; until: number } | null = null;

  /** Open the map centred on the player (world px). */
  show(playerX: number, playerY: number): void {
    this.open = true;
    this.cx = playerX / TILE_SIZE;
    this.cy = playerY / TILE_SIZE;
    this.zoom = MAP_ZOOM_START;
    this.dragFrom = null;
    this.notice = null;
  }

  /** Is a pin name being typed? Esc then stops the typing rather than closing the map. */
  get isEditing(): boolean {
    return this.editing !== null;
  }

  /** Close the map, keeping any pin name being typed. */
  hide(pins: MapPins): void {
    this.stopEditing(pins, true);
    this.open = false;
  }

  /** Stop editing a pin: `keep` renames it to what was typed (nothing typed keeps its name). */
  stopEditing(pins: MapPins, keep: boolean): void {
    if (this.editing === null) return;
    const name = typedText();
    if (keep && name !== null) pins.rename(this.editing, name);
    this.editing = null;
    stopTyping();
  }

  /**
   * One update step: pins (right-click adds or picks one; the editor takes typing and clicks),
   * then pan and zoom. (width, height) is the canvas size; u the pixel scale.
   */
  update(dt: number, input: MapInput, width: number, height: number, u: number, worldWidth: number, worldHeight: number, context: PinContext): void {
    if (input.clicked) this.pressOnEditor = this.editing !== null && hit(this.editorLayout(width, height, u).box, input.mouseX, input.mouseY);
    if (!input.dragging) this.pressOnEditor = false;
    this.updatePins(input, width, height, u, context);
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
    if (input.dragging && !this.pressOnEditor) {
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

  /** Right-click adds a pin or opens one in the editor; the editor's buttons and keys. */
  private updatePins(input: MapInput, width: number, height: number, u: number, { pins, explored }: PinContext): void {
    if (this.editing !== null && this.editing >= pins.pins.length) this.stopEditing(pins, false);
    if (this.editing !== null) {
      if (input.confirm || input.cancel) {
        this.stopEditing(pins, input.confirm);
        sfx.uiClick();
        return;
      }
      if (input.clicked) {
        const layout = this.editorLayout(width, height, u);
        const button = layout.buttons.find((b) => hit(b.rect, input.mouseX, input.mouseY));
        if (button) {
          this.pressEditorButton(button.id, pins);
          sfx.uiClick();
          return;
        }
        // A click elsewhere on the map keeps the name and closes the editor.
        if (!hit(layout.box, input.mouseX, input.mouseY)) this.stopEditing(pins, true);
      }
    }
    if (!input.pin) return;
    if (this.editing !== null && hit(this.editorLayout(width, height, u).box, input.mouseX, input.mouseY)) return;
    const picked = this.pinAt(pins.pins, input.mouseX, input.mouseY, width, height, u);
    this.stopEditing(pins, true);
    if (picked !== null) {
      this.edit(picked);
      sfx.uiClick();
      return;
    }
    const scale = this.pxPerTile(u);
    const tx = Math.floor(this.cx + (input.mouseX - width / 2) / scale);
    const ty = Math.floor(this.cy + (input.mouseY - height / 2) / scale);
    const added = pins.add(tx, ty, explored);
    if (added === 'unexplored') {
      this.say("You can only pin places you've explored");
    } else if (added === 'full') {
      this.say(`You have ${MAP_PIN_MAX} pins already: delete one first`);
    } else {
      this.edit(added);
      sfx.uiClick();
    }
  }

  /** Open the editor on pin `index`. Typing starts empty: the first key replaces the old name. */
  private edit(index: number): void {
    this.editing = index;
    startTyping('', MAP_PIN_NAME_MAX);
  }

  private pressEditorButton(id: EditorButton, pins: MapPins): void {
    const index = this.editing!;
    if (id === 'track') {
      pins.setTracked(index, pins.tracked !== index);
    } else if (id === 'delete') {
      this.stopEditing(pins, false);
      pins.remove(index);
    } else {
      this.stopEditing(pins, true);
    }
  }

  private say(text: string): void {
    this.notice = { text, until: performance.now() + NOTICE_MS };
  }

  /** The pin whose marker is nearest screen point (x, y), within MAP_PIN_HIT, or null. */
  private pinAt(pins: readonly MapPin[], x: number, y: number, width: number, height: number, u: number): number | null {
    const scale = this.pxPerTile(u);
    let best: number | null = null;
    let bestDistance = MAP_PIN_HIT * u + scale / 2;
    pins.forEach((pin, i) => {
      // Measured to the pin's head, a little above the pinned tile's centre (see drawPin).
      const px = width / 2 + (pin.tx + 0.5 - this.cx) * scale;
      const py = height / 2 + (pin.ty + 0.5 - this.cy) * scale - 4 * u;
      const distance = Math.min(Math.hypot(x - px, y - py), Math.hypot(x - px, y - py - 4 * u));
      if (distance <= bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  }

  private editorLayout(width: number, height: number, u: number): EditorLayout {
    const box: Rect = { x: Math.round(width / 2 - (EDITOR_W * u) / 2), y: Math.round(height - (EDITOR_H + 24) * u), w: EDITOR_W * u, h: EDITOR_H * u };
    const buttons: EditorLayout['buttons'] = [];
    let x = box.x + 5 * u;
    for (const { id, w } of EDITOR_BUTTONS) {
      const left = id === 'done' ? box.x + box.w - (w + 5) * u : x;
      buttons.push({ id, rect: { x: left, y: box.y + 16 * u, w: w * u, h: 11 * u } });
      x += (w + 3) * u;
    }
    return { box, buttons };
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
    if (markers.camp) marker(ctx, sx(markers.camp.tx + 1), sy(markers.camp.ty + 1), size * 1.4, CAMP_COLOR, u);
    ctx.font = `${4 * u}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const stop of markers.liftStops) {
      marker(ctx, sx(stop.tx + 0.5), sy(stop.ty + 0.5), size, LIFT_COLOR, u);
      shadowText(ctx, stop.name, sx(stop.tx + 0.5) + size, sy(stop.ty + 0.5), LIFT_COLOR, u);
    }
    for (const satchel of markers.satchels) diamond(ctx, sx(satchel.tx), sy(satchel.ty), size * 1.4, SATCHEL_COLOR, u);
    if (markers.heart) diamond(ctx, sx(markers.heart.tx + 0.5), sy(markers.heart.ty + 0.5), size * 1.8, HEART_COLOR, u);
    marker(ctx, sx(markers.playerX / TILE_SIZE), sy(markers.playerY / TILE_SIZE), size * 1.4, PLAYER_COLOR, u);
    // Pins on top, with the one being edited showing what's typed.
    markers.pins.forEach((pin, i) => {
      const name = i === this.editing ? typedText() || pin.name : pin.name;
      drawPin(ctx, sx(pin.tx + 0.5), sy(pin.ty + 0.5), name, i === markers.trackedPin, i === this.editing, u);
    });

    ctx.font = `${8 * u}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    shadowText(ctx, 'Map', width / 2, 8 * u, '#fff', u);
    ctx.font = `${5 * u}px monospace`;
    shadowText(ctx, mapHelpText(), width / 2, 19 * u, '#b8b8c8', u);
    if (this.notice && performance.now() < this.notice.until) shadowText(ctx, this.notice.text, width / 2, 28 * u, '#ffb0a0', u);
    const editing = this.editing === null ? undefined : markers.pins[this.editing];
    if (editing) this.drawEditor(ctx, editing, this.editing === markers.trackedPin, u);
    drawLegend(ctx, width / 2, height - 12 * u, u, markers);
    ctx.restore();
  }

  /** The pin editor: the name being typed, the Track / Delete / Done buttons and the keys. */
  private drawEditor(ctx: CanvasRenderingContext2D, pin: MapPin, tracked: boolean, u: number): void {
    const { width, height } = ctx.canvas;
    const { box, buttons } = this.editorLayout(width, height, u);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(box.x - u, box.y - u, box.w + 2 * u, box.h + 2 * u);
    ctx.fillStyle = 'rgba(18, 18, 26, 0.95)';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `${6 * u}px monospace`;
    const typed = typedText() ?? '';
    const label = 'Pin: ';
    shadowText(ctx, label, box.x + 5 * u, box.y + 5 * u, '#b8b8c8', u);
    const nameX = box.x + 5 * u + ctx.measureText(label).width;
    // Nothing typed yet: the current name shows grey, and typing replaces it.
    shadowText(ctx, typed || pin.name, nameX, box.y + 5 * u, typed ? '#fff' : '#8a8a8a', u);
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(nameX + ctx.measureText(typed).width), box.y + 4 * u, u, 7 * u);
    }
    const labels: Record<EditorButton, string> = { track: tracked ? 'Tracked ✓' : 'Track on HUD', delete: 'Delete', done: 'Done' };
    ctx.font = `${5 * u}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { id, rect } of buttons) {
      ctx.fillStyle = id === 'track' && tracked ? 'rgba(90, 209, 230, 0.45)' : id === 'delete' ? 'rgba(208, 96, 60, 0.45)' : 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      shadowText(ctx, labels[id], rect.x + rect.w / 2, rect.y + rect.h / 2 + u / 2, '#fff', u);
    }
    ctx.textBaseline = 'top';
    shadowText(ctx, pinEditorHelp(), box.x + box.w / 2, box.y + 30 * u, '#8a8a9a', u);
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

/** A round pin head centred on (x, y) screen px, radius r, with a dark outline. */
function pinHead(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, u: number): void {
  const edge = Math.max(1, Math.round(u / 2));
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r + edge, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A map pin standing on (x, y) screen px (the pinned tile's centre): a stalk with a round head,
 * and its name beside it. The tracked pin is white; the one being edited has a yellow ring.
 */
function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, tracked: boolean, editing: boolean, u: number): void {
  const color = tracked ? TRACKED_PIN_COLOR : PIN_COLOR;
  const headY = y - 4 * u;
  ctx.fillStyle = '#000';
  ctx.fillRect(Math.round(x - u), Math.round(headY), 2 * u, 5 * u);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - u / 2), Math.round(headY), u, 4 * u);
  if (editing) {
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = u;
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(headY), 5 * u, 0, Math.PI * 2);
    ctx.stroke();
  }
  pinHead(ctx, x, headY, 2.5 * u, color, u);
  ctx.font = `${5 * u}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  shadowText(ctx, name, Math.round(x + 5 * u), Math.round(headY), color, u);
}

function drawLegend(ctx: CanvasRenderingContext2D, cx: number, y: number, u: number, markers: MapMarkers): void {
  const items: [string, string][] = [
    [PLAYER_COLOR, 'You'],
    [SPAWN_COLOR, 'Spawn'],
    [CHEST_COLOR, 'Chest'],
  ];
  if (markers.bed) items.push([BED_COLOR, 'Bed']);
  if (markers.camp) items.push([CAMP_COLOR, 'Camp']);
  if (markers.liftStops.length > 0) items.push([LIFT_COLOR, 'Lift stop']);
  if (markers.satchels.length > 0) items.push([SATCHEL_COLOR, 'Satchel']);
  if (markers.heart) items.push([HEART_COLOR, 'Heart of the Deep']);
  if (markers.pins.some((_, i) => i !== markers.trackedPin)) items.push([PIN_COLOR, 'Pin']);
  if (markers.trackedPin !== null) items.push([TRACKED_PIN_COLOR, 'Tracked pin']);
  ctx.font = `${5 * u}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const gap = 10 * u;
  const widths = items.map(([, label]) => 6 * u + ctx.measureText(label).width);
  let x = cx - (widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1)) / 2;
  items.forEach(([color, label], i) => {
    if (color === SATCHEL_COLOR || color === HEART_COLOR) diamond(ctx, x + 2 * u, y, 4 * u, color, u);
    else if (color === PIN_COLOR || color === TRACKED_PIN_COLOR) pinHead(ctx, x + 2 * u, y, 2 * u, color, u);
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
  if (markers.camp) marker(ctx, at(markers.camp.tx + 0.5, left, x0), at(markers.camp.ty + 0.5, top, y0), 3 * u, CAMP_COLOR, u);
  for (const stop of markers.liftStops) marker(ctx, at(stop.tx, left, x0), at(stop.ty, top, y0), 2 * u, LIFT_COLOR, u);
  for (const satchel of markers.satchels) {
    diamond(ctx, x0 + (satchel.tx - left) * u, y0 + (satchel.ty - top) * u, 3 * u, SATCHEL_COLOR, u);
  }
  if (markers.heart) diamond(ctx, at(markers.heart.tx, left, x0), at(markers.heart.ty, top, y0), 4 * u, HEART_COLOR, u);
  markers.pins.forEach((pin, i) => {
    pinHead(ctx, at(pin.tx, left, x0), at(pin.ty, top, y0), 1.5 * u, i === markers.trackedPin ? TRACKED_PIN_COLOR : PIN_COLOR, u);
  });
  marker(ctx, x0 + (markers.playerX / TILE_SIZE - left) * u, y0 + (markers.playerY / TILE_SIZE - top) * u, 3 * u, PLAYER_COLOR, u);
  ctx.restore();
}
