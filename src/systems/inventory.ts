import { BAG_SIZE, HOTBAR_SIZE } from '../config';
import { itemDef, type ItemId } from './items';

export interface ItemStack {
  item: ItemId;
  count: number;
}

/** What a new world starts with. */
export const STARTING_ITEMS: ReadonlyArray<[ItemId, number]> = [
  ['wooden_pickaxe', 1],
  ['torch', 10],
];

/** Hotbar (slots 0..HOTBAR_SIZE-1) followed by the bag. Empty slots are null. */
export class Inventory {
  readonly slots: (ItemStack | null)[] = new Array(HOTBAR_SIZE + BAG_SIZE).fill(null);
  /** Selected hotbar slot. */
  selected = 0;
  /** Stack picked up with the mouse in the inventory panel, if any. */
  cursor: ItemStack | null = null;

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

  /** Move the hotbar selection by `steps`, wrapping around. */
  scrollSelection(steps: number): void {
    this.selected = (((this.selected + steps) % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  }

  /**
   * Click on a slot in the inventory panel: with nothing held, pick its stack up; holding a
   * stack, put it down, merge it into the same item, or swap it with what's there.
   */
  clickSlot(index: number): void {
    const slot = this.slots[index];
    const held = this.cursor;
    if (!held) {
      this.cursor = slot;
      this.slots[index] = null;
      return;
    }
    if (slot && slot.item === held.item && slot.count < itemDef(slot.item).maxStack) {
      const moved = Math.min(held.count, itemDef(slot.item).maxStack - slot.count);
      slot.count += moved;
      held.count -= moved;
      if (held.count === 0) this.cursor = null;
      return;
    }
    this.slots[index] = held;
    this.cursor = slot;
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
    const max = itemDef(item).maxStack;
    for (let i = from; i < to && count > 0; i++) {
      const stack = this.slots[i];
      if (stack && stack.item === item && stack.count < max) {
        const moved = Math.min(count, max - stack.count);
        stack.count += moved;
        count -= moved;
      }
    }
    for (let i = from; i < to && count > 0; i++) {
      if (this.slots[i]) continue;
      const moved = Math.min(count, max);
      this.slots[i] = { item, count: moved };
      count -= moved;
    }
    return count;
  }
}
