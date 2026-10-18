import { BAG_SIZE, GEAR_SLOTS, HOTBAR_SIZE } from '../config';
import { isAccessory, itemDef, type ItemId } from './items';
import type { StatModifier } from './stats';

export interface ItemStack {
  item: ItemId;
  count: number;
}

/** A row of item slots (an inventory, a chest). Empty slots are null. */
export type Slots = (ItemStack | null)[];

/** What a new world starts with. */
export const STARTING_ITEMS: ReadonlyArray<[ItemId, number]> = [
  ['wooden_pickaxe', 1],
  ['torch', 10],
];

/** Why an accessory couldn't go into a gear slot (see Inventory.canWear). */
export type WearProblem = 'notGear' | 'wearing' | null;

/**
 * Hotbar (slots 0..HOTBAR_SIZE-1) followed by the bag, and the gear slots (Phase 16) apart from
 * them: what's worn there isn't counted, crafted with, stacked away or dropped on death.
 * Empty slots are null.
 */
export class Inventory {
  readonly slots: Slots = new Array(HOTBAR_SIZE + BAG_SIZE).fill(null);
  /** Worn accessories, at most one of each. */
  readonly gear: Slots = new Array(GEAR_SLOTS).fill(null);
  /** Selected hotbar slot. */
  selected = 0;
  /** Stack picked up with the mouse in the inventory panel, if any. */
  cursor: ItemStack | null = null;
  /**
   * The trash slot: the last stack thrown away, which can be taken back until something else
   * replaces it. Not saved.
   */
  trash: ItemStack | null = null;

  static withStartingItems(): Inventory {
    const inventory = new Inventory();
    for (const [item, count] of STARTING_ITEMS) inventory.add(item, count);
    return inventory;
  }

  get selectedStack(): ItemStack | null {
    return this.slots[this.selected];
  }

  /**
   * Add items: top up existing stacks of the same item first, then fill the first empty
   * slots (hotbar before bag). Returns how many didn't fit.
   */
  add(item: ItemId, count: number): number {
    return this.addToRange(item, count, 0, this.slots.length);
  }

  /** Is there room for at least one more of this item? */
  canAdd(item: ItemId): boolean {
    const max = itemDef(item).maxStack;
    return this.slots.some((s) => s === null || (s.item === item && s.count < max));
  }

  count(item: ItemId): number {
    return this.slots.reduce((n, s) => (s && s.item === item ? n + s.count : n), 0);
  }

  removeFromSlot(index: number, count = 1): void {
    const stack = this.slots[index];
    if (!stack) return;
    stack.count -= count;
    if (stack.count <= 0) this.slots[index] = null;
  }

  /** Remove `count` of an item, taking from the bag end first. False (and no change) if short. */
  remove(item: ItemId, count: number): boolean {
    if (this.count(item) < count) return false;
    for (let i = this.slots.length - 1; i >= 0 && count > 0; i--) {
      const stack = this.slots[i];
      if (!stack || stack.item !== item) continue;
      const taken = Math.min(count, stack.count);
      this.removeFromSlot(i, taken);
      count -= taken;
    }
    return true;
  }

  /** Highest pickaxe tier carried (including on the cursor), or -1 with no pickaxe. */
  bestPickaxeTier(): number {
    let best = -1;
    for (const stack of [...this.slots, this.cursor]) {
      const tier = stack ? itemDef(stack.item).pickaxeTier : undefined;
      if (tier !== undefined && tier > best) best = tier;
    }
    return best;
  }

  /**
   * Middle-click pick: select a hotbar slot holding `item`. If it's only in the bag, move it to
   * the hotbar (the selected slot if empty, else the first empty one, else swap it with the
   * selected stack) and select it. Returns false if the item isn't carried.
   */
  pick(item: ItemId): boolean {
    const inHotbar = this.slots.findIndex((s, i) => i < HOTBAR_SIZE && s?.item === item);
    if (inHotbar >= 0) {
      this.selected = inHotbar;
      return true;
    }
    const inBag = this.slots.findIndex((s, i) => i >= HOTBAR_SIZE && s?.item === item);
    if (inBag < 0) return false;
    const empty = this.slots.findIndex((s, i) => i < HOTBAR_SIZE && !s);
    const target = !this.slots[this.selected] || empty < 0 ? this.selected : empty;
    [this.slots[target], this.slots[inBag]] = [this.slots[inBag], this.slots[target]];
    this.selected = target;
    return true;
  }

  /** Move the hotbar selection by `steps`, wrapping around. */
  scrollSelection(steps: number): void {
    this.selected = (((this.selected + steps) % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  }

  /**
   * Click on a slot in the inventory panel: with nothing held, pick its stack up; holding a
   * stack, put it down, merge it into the same item, or swap it with what's there.
   */
  clickSlot(index: number): void {
    this.cursor = clickSlotIn(this.slots, index, this.cursor);
  }

  /**
   * Click on the trash slot: a held stack goes in (destroying what was there); with nothing
   * held, take back what's in it.
   */
  clickTrash(): void {
    if (this.cursor) {
      this.trash = this.cursor;
      this.cursor = null;
    } else {
      this.cursor = this.trash;
      this.trash = null;
    }
  }

  /** What the worn accessories add to the player's stats. */
  gearModifiers(): StatModifier[] {
    return this.gear.flatMap((s) => (s ? [itemDef(s.item).accessory ?? {}] : []));
  }

  /** Is this accessory worn? */
  wearing(item: ItemId): boolean {
    return this.gear.some((s) => s?.item === item);
  }

  /**
   * Can `item` go into gear slot `index` (replacing what's there)? Only accessories, and only
   * one of each: 'wearing' if another gear slot already has one.
   */
  canWear(item: ItemId, index: number): WearProblem {
    if (!isAccessory(item)) return 'notGear';
    return this.gear.some((s, i) => i !== index && s?.item === item) ? 'wearing' : null;
  }

  /**
   * Click on gear slot `index`: with nothing held, take the accessory off onto the mouse;
   * holding an accessory, put it on (swapping with what's there). Returns why it couldn't, or
   * null if it worked (or there was nothing to do).
   */
  clickGear(index: number): WearProblem {
    const held = this.cursor;
    if (!held) {
      this.cursor = this.gear[index];
      this.gear[index] = null;
      return null;
    }
    const problem = this.canWear(held.item, index);
    if (problem) return problem;
    // Accessories don't stack (maxStack 1), so the held one swaps with what's worn there.
    this.cursor = this.gear[index];
    this.gear[index] = held;
    return null;
  }

  /**
   * Shift-click on an accessory in slot `index`: wear it in the first empty gear slot.
   * Returns why it couldn't: 'notGear', 'wearing', or 'full' with every gear slot taken.
   */
  wearFromSlot(index: number): WearProblem | 'full' {
    const stack = this.slots[index];
    if (!stack) return null;
    const free = this.gear.findIndex((s) => !s);
    const problem = this.canWear(stack.item, free);
    if (problem) return problem;
    if (free < 0) return 'full';
    this.gear[free] = { item: stack.item, count: 1 };
    this.removeFromSlot(index, 1);
    return null;
  }

  /** Shift-click on gear slot `index`: take it off into the inventory. False (and no change) if there's no room. */
  takeOff(index: number): boolean {
    const worn = this.gear[index];
    if (!worn) return true;
    if (!this.canAdd(worn.item)) return false;
    this.add(worn.item, worn.count);
    this.gear[index] = null;
    return true;
  }

  /** Shift-click: move a stack from the hotbar to the bag or back, merging where it can. */
  quickMove(index: number): void {
    const stack = this.slots[index];
    if (!stack) return;
    const toBag = index < HOTBAR_SIZE;
    const left = toBag
      ? this.addToRange(stack.item, stack.count, HOTBAR_SIZE, this.slots.length)
      : this.addToRange(stack.item, stack.count, 0, HOTBAR_SIZE);
    if (left === 0) this.slots[index] = null;
    else stack.count = left;
  }

  /** Put the cursor stack back into the inventory. Returns what didn't fit (cursor is cleared). */
  returnCursor(): ItemStack | null {
    const held = this.cursor;
    this.cursor = null;
    if (!held) return null;
    const left = this.add(held.item, held.count);
    return left > 0 ? { item: held.item, count: left } : null;
  }

  private addToRange(item: ItemId, count: number, from: number, to: number): number {
    return addToSlots(this.slots, item, count, from, to);
  }
}

/**
 * Add items to slots [from, to): top up stacks of the same item first, then fill empty slots
 * in order. Returns how many didn't fit.
 */
export function addToSlots(slots: Slots, item: ItemId, count: number, from = 0, to = slots.length): number {
  const max = itemDef(item).maxStack;
  for (let i = from; i < to && count > 0; i++) {
    const stack = slots[i];
    if (stack && stack.item === item && stack.count < max) {
      const moved = Math.min(count, max - stack.count);
      stack.count += moved;
      count -= moved;
    }
  }
  for (let i = from; i < to && count > 0; i++) {
    if (slots[i]) continue;
    const moved = Math.min(count, max);
    slots[i] = { item, count: moved };
    count -= moved;
  }
  return count;
}

/**
 * Click on slot `index` while the mouse holds `held` (or nothing): pick the stack up, put the
 * held one down, merge it into the same item, or swap the two. Returns what the mouse holds after.
 */
export function clickSlotIn(slots: Slots, index: number, held: ItemStack | null): ItemStack | null {
  const slot = slots[index];
  if (!held) {
    slots[index] = null;
    return slot;
  }
  const max = slot ? itemDef(slot.item).maxStack : 0;
  if (slot && slot.item === held.item && slot.count < max) {
    const moved = Math.min(held.count, max - slot.count);
    slot.count += moved;
    held.count -= moved;
    return held.count === 0 ? null : held;
  }
  slots[index] = held;
  return slot;
}

/** Copy of a row of slots (stacks copied too), for undoing a change. */
export function copySlots(slots: Slots): Slots {
  return slots.map((s) => s && { ...s });
}
