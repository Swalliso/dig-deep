import { LIFT_PANEL_ROWS, LIFT_STOP_NAME_MAX, SURFACE_LEVEL } from '../config';
import { startTyping, stopTyping, typedText } from '../input';
import type { LiftView, StopInfo } from '../systems/lifts';
import { liftPanelHelp, pinEditorHelp } from './controls';
import { shadowText } from './hud';

// The lift panel (Phase 15): opened by right-clicking a lift stop, it lists every stop on that
// rail, top first, with its name, its depth and whether a trip there can go ahead. Clicking a
// stop rides there (calling the cage first if it's elsewhere); the stop it was opened at can be
// renamed. It pauses the world, like the inventory panel. Sizes are in UI units (`u` screen px).

/** One update step of input for the open panel. */
export interface LiftPanelInput {
  wheel: number;
  mouseX: number;
  mouseY: number;
  clicked: boolean;
  /** While renaming: keep the name (Enter), or stop without renaming (Esc). Esc otherwise closes. */
  confirm: boolean;
  cancel: boolean;
}

/** What the player chose. */
export type LiftPanelAction =
  | { kind: 'ride'; to: StopInfo }
  | { kind: 'call' }
  | { kind: 'rename'; name: string }
  | { kind: 'close' };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 230;
const HEADER = 30;
const ROW = 13;
const FOOTER = 34;

const hit = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** "45 m" below the surface level, "12 m up" above it. */
export function depthText(depth: number): string {
  return depth >= 0 ? `${depth} m` : `${-depth} m up`;
}

/** What a stop's row says on its right, and whether clicking it does something. */
export function stopAction(stop: StopInfo, cageHere: boolean): { text: string; color: string; clickable: boolean } {
  switch (stop.status) {
    case 'here':
      return cageHere ? { text: 'You are here', color: '#9a9aaa', clickable: false } : { text: 'Call the cage here', color: '#ffe066', clickable: true };
    case 'ok':
      return { text: 'Ride there ▸', color: '#9be88a', clickable: true };
    case 'blocked':
      return { text: 'Blocked: no room to step out', color: '#ffb070', clickable: false };
    case 'noHeadroom':
      return { text: 'Blocked: no room above the rail', color: '#ffb070', clickable: false };
    case 'disconnected':
      return { text: `Rail broken at ${depthText(stop.gapRow! - SURFACE_LEVEL)}`, color: '#ff8a7a', clickable: false };
  }
}

/** Where the cage is, for the panel's second line. */
export function cageText(view: LiftView): string {
  const here = view.stops[view.here];
  const rows = view.cageRow - here.sy;
  if (view.cage.target !== null) return 'Cage: on its way';
  if (rows === 0) return 'Cage: here';
  return `Cage: ${Math.abs(rows)} m ${rows > 0 ? 'below' : 'above'}`;
}

export class LiftPanel {
  open = false;
  /** The stop it was opened at. */
  stop: { sx: number; sy: number } | null = null;
  /** Typing a new name for this stop. */
  renaming = false;
  /** First stop shown (the wheel scrolls a long list). */
  private scroll = 0;

  show(sx: number, sy: number, view: LiftView): void {
    this.open = true;
    this.stop = { sx, sy };
    this.renaming = false;
    // Start with this stop in view.
    this.scroll = Math.max(0, Math.min(view.here - Math.floor(LIFT_PANEL_ROWS / 2), view.stops.length - LIFT_PANEL_ROWS));
  }

  /** Stop typing a new name without renaming (the pause menu is opening). */
  stopRenaming(): void {
    if (this.renaming) stopTyping();
    this.renaming = false;
  }

  hide(): void {
    if (this.renaming) stopTyping();
    this.open = false;
    this.renaming = false;
    this.stop = null;
  }

  /** One step of input. (width, height) is the canvas size. Returns what the player chose, if anything. */
  update(input: LiftPanelInput, view: LiftView, width: number, height: number, u: number): LiftPanelAction | null {
    const layout = this.layout(view, width, height, u);
    if (this.renaming) {
      const done = input.confirm || (input.clicked && hit(layout.renameButton, input.mouseX, input.mouseY));
      if (done || input.cancel || input.clicked) {
        const name = (typedText() ?? '').trim();
        this.renaming = false;
        stopTyping();
        // A click elsewhere keeps what was typed too; Esc throws it away.
        if (!input.cancel && name) return { kind: 'rename', name };
      }
      return null;
    }
    if (input.cancel) return { kind: 'close' };
    const shown = Math.min(LIFT_PANEL_ROWS, view.stops.length);
    if (input.wheel !== 0) this.scroll = Math.max(0, Math.min(view.stops.length - shown, this.scroll + Math.sign(input.wheel)));
    if (!input.clicked) return null;
    if (hit(layout.closeButton, input.mouseX, input.mouseY)) return { kind: 'close' };
    if (hit(layout.renameButton, input.mouseX, input.mouseY)) {
      this.renaming = true;
      startTyping('', LIFT_STOP_NAME_MAX);
      return null;
    }
    const row = layout.rows.find((r) => hit(r.rect, input.mouseX, input.mouseY));
    if (!row) return null;
    const stop = view.stops[row.index];
    if (!stopAction(stop, view.cageRow === stop.sy && view.cage.target === null).clickable) return null;
    return stop.status === 'here' ? { kind: 'call' } : { kind: 'ride', to: stop };
  }

  draw(ctx: CanvasRenderingContext2D, view: LiftView, mouseX: number, mouseY: number, u: number): void {
    const { width, height } = ctx.canvas;
    const { box, rows, renameButton, closeButton } = this.layout(view, width, height, u);
    const here = view.stops[view.here];
    const cageHere = view.cageRow === here.sy && view.cage.target === null;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(box.x - u, box.y - u, box.w + 2 * u, box.h + 2 * u);
    ctx.fillStyle = 'rgba(18, 18, 26, 0.95)';
    ctx.fillRect(box.x, box.y, box.w, box.h);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = `${7 * u}px monospace`;
    shadowText(ctx, `Lift: ${here.name}`, box.x + 6 * u, box.y + 5 * u, '#ffe066', u);
    ctx.font = `${5 * u}px monospace`;
    shadowText(ctx, `${depthText(here.depth)} · ${view.stops.length} stop${view.stops.length === 1 ? '' : 's'} · ${cageText(view)}`, box.x + 6 * u, box.y + 16 * u, '#b8b8c8', u);

    ctx.textBaseline = 'middle';
    for (const { index, rect } of rows) {
      const stop = view.stops[index];
      const action = stopAction(stop, cageHere);
      const hover = action.clickable && hit(rect, mouseX, mouseY);
      if (stop.status === 'here' || hover) {
        ctx.fillStyle = hover ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 224, 102, 0.1)';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      const mid = rect.y + rect.h / 2 + u / 2;
      ctx.font = `${6 * u}px monospace`;
      ctx.textAlign = 'left';
      // The cage's row is marked on the left, so it's clear where it is before a trip.
      if (view.cageRow === stop.sy) shadowText(ctx, '▣', rect.x + 2 * u, mid, '#c9ccd2', u);
      const renamingThis = this.renaming && stop.status === 'here';
      const typed = typedText() ?? '';
      const name = renamingThis ? typed || stop.name : stop.name;
      shadowText(ctx, name, rect.x + 11 * u, mid, renamingThis && !typed ? '#8a8a8a' : stop.status === 'disconnected' ? '#9a9aaa' : '#fff', u);
      if (renamingThis && Math.floor(performance.now() / 500) % 2 === 0) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(rect.x + 11 * u + ctx.measureText(typed).width), Math.round(mid - 3.5 * u), u, 7 * u);
      }
      ctx.font = `${5 * u}px monospace`;
      ctx.textAlign = 'right';
      shadowText(ctx, depthText(stop.depth), rect.x + 112 * u, mid, '#b8b8c8', u);
      ctx.textAlign = 'left';
      shadowText(ctx, action.text, rect.x + 120 * u, mid, action.color, u);
    }
    const shown = rows.length;
    if (view.stops.length > shown) {
      ctx.textAlign = 'right';
      const more = `${this.scroll + 1}–${this.scroll + shown} of ${view.stops.length} (wheel scrolls)`;
      shadowText(ctx, more, box.x + box.w - 6 * u, box.y + 16 * u + 3 * u, '#8a8a9a', u);
    }

    ctx.font = `${5 * u}px monospace`;
    ctx.textAlign = 'center';
    for (const [rect, label] of [
      [renameButton, this.renaming ? 'Done' : 'Rename this stop'],
      [closeButton, 'Close'],
    ] as const) {
      ctx.fillStyle = hit(rect, mouseX, mouseY) ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      shadowText(ctx, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + u / 2, '#fff', u);
    }
    ctx.textBaseline = 'top';
    shadowText(ctx, this.renaming ? pinEditorHelp() : liftPanelHelp(), box.x + box.w / 2, closeButton.y + closeButton.h + 4 * u, '#8a8a9a', u);
    ctx.restore();
  }

  private layout(view: LiftView, width: number, height: number, u: number): { box: Rect; rows: { index: number; rect: Rect }[]; renameButton: Rect; closeButton: Rect } {
    const shown = Math.min(LIFT_PANEL_ROWS, view.stops.length);
    this.scroll = Math.max(0, Math.min(this.scroll, view.stops.length - shown));
    const h = (HEADER + shown * ROW + FOOTER) * u;
    const box: Rect = { x: Math.round(width / 2 - (W * u) / 2), y: Math.round(height / 2 - h / 2), w: W * u, h };
    const rows = Array.from({ length: shown }, (_, i) => ({
      index: this.scroll + i,
      rect: { x: box.x + 3 * u, y: box.y + (HEADER + i * ROW) * u, w: box.w - 6 * u, h: (ROW - 1) * u },
    }));
    const buttonsY = box.y + (HEADER + shown * ROW + 5) * u;
    const renameButton: Rect = { x: box.x + 6 * u, y: buttonsY, w: 80 * u, h: 11 * u };
    const closeButton: Rect = { x: box.x + box.w - 46 * u, y: buttonsY, w: 40 * u, h: 11 * u };
    return { box, rows, renameButton, closeButton };
  }
}
