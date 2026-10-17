import { MAP_PIN_MAX, MAP_PIN_NAME_MAX } from '../config';
import type { ExploredMap } from '../world/explored';
import type { World } from '../world/world';

// Map pins: a few named marks the player puts on the full map (veins, other ways down, places
// to come back to). Only explored tiles can be pinned. One pin can be tracked, which shows its
// direction and distance on the HUD.

export interface MapPin {
  tx: number;
  ty: number;
  name: string;
}

/** Map pins as saved. */
export interface SavedMapPins {
  pins: MapPin[];
  /** Index of the tracked pin, or null. */
  tracked: number | null;
}

/** Why a pin couldn't be added. */
export type AddPinProblem = 'unexplored' | 'full';

/** A pin name as stored: single spaces, no spaces at the ends, at most MAP_PIN_NAME_MAX characters. */
export function cleanPinName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAP_PIN_NAME_MAX).trim();
}

export class MapPins {
  readonly pins: MapPin[] = [];
  /** Index of the pin shown on the HUD, or null. */
  tracked: number | null = null;

  get full(): boolean {
    return this.pins.length >= MAP_PIN_MAX;
  }

  /** The tracked pin, or null. */
  get trackedPin(): MapPin | null {
    return this.tracked === null ? null : (this.pins[this.tracked] ?? null);
  }

  /**
   * Add a pin at tile (tx, ty), named "Pin N" (the lowest N not taken). The first pin, or any pin
   * added while none is tracked, is tracked straight away. Returns its index, or why it can't be
   * added: the tile hasn't been seen, or there are MAP_PIN_MAX pins already.
   */
  add(tx: number, ty: number, explored: ExploredMap): number | AddPinProblem {
    if (!explored.isExplored(tx, ty)) return 'unexplored';
    if (this.full) return 'full';
    this.pins.push({ tx, ty, name: this.freeName() });
    const index = this.pins.length - 1;
    if (this.tracked === null) this.tracked = index;
    return index;
  }

  remove(index: number): void {
    if (index < 0 || index >= this.pins.length) return;
    this.pins.splice(index, 1);
    if (this.tracked === index) this.tracked = null;
    else if (this.tracked !== null && this.tracked > index) this.tracked--;
  }

  /** Rename a pin. An empty name keeps the old one. */
  rename(index: number, name: string): void {
    const pin = this.pins[index];
    const clean = cleanPinName(name);
    if (pin && clean) pin.name = clean;
  }

  /** Track pin `index` (untracking any other), or stop tracking it. */
  setTracked(index: number, on: boolean): void {
    if (on) this.tracked = index >= 0 && index < this.pins.length ? index : this.tracked;
    else if (this.tracked === index) this.tracked = null;
  }

  saved(): SavedMapPins {
    return { pins: this.pins.map((p) => ({ ...p })), tracked: this.tracked };
  }

  /** Pins from a save (missing in older saves). Pins outside the world or without a name are skipped. */
  static fromSave(saved: unknown, world: World): MapPins {
    const pins = new MapPins();
    if (!saved || typeof saved !== 'object') return pins;
    const { pins: list, tracked } = saved as Partial<SavedMapPins>;
    if (!Array.isArray(list)) return pins;
    let trackedIndex: number | null = null;
    list.forEach((pin: Partial<MapPin> | null, i) => {
      if (pins.full || !pin || !Number.isInteger(pin.tx) || !Number.isInteger(pin.ty) || typeof pin.name !== 'string') return;
      if (!world.inBounds(pin.tx!, pin.ty!)) return;
      const name = cleanPinName(pin.name) || pins.freeName();
      if (i === tracked) trackedIndex = pins.pins.length;
      pins.pins.push({ tx: pin.tx!, ty: pin.ty!, name });
    });
    pins.tracked = trackedIndex;
    return pins;
  }

  private freeName(): string {
    const taken = new Set(this.pins.map((p) => p.name));
    let n = 1;
    while (taken.has(`Pin ${n}`)) n++;
    return `Pin ${n}`;
  }
}
