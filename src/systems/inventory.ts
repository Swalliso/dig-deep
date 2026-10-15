import { BAG_SIZE, HOTBAR_SIZE } from '../config';
import { itemDef, type ItemId } from './items';

export interface ItemStack {
  item: ItemId;
  count: number;
}

/** Hotbar (slots 0..HOTBAR_SIZE-1) followed by the bag. Empty slots are null. */
export class Inventory {
  readonly slots: (ItemStack | null)[] = new Array(HOTBAR_SIZE + BAG_SIZE).fill(null);
  /** Selected hotbar slot. */
  selected = 0;

  get selectedStack(): ItemStack | null {
    return this.slots[this.selected];
  }

  /**
   * Add items: top up existing stacks of the same item first, then fill the first empty
   * slots (hotbar before bag). Returns how many didn't fit.
   */
  add(item: ItemId, count: number): number {
    const max = itemDef(item).maxStack;
    for (const stack of this.slots) {
      if (count === 0) break;
      if (stack && stack.item === item && stack.count < max) {
        const moved = Math.min(count, max - stack.count);
        stack.count += moved;
        count -= moved;
      }
    }
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (this.slots[i]) continue;
      const moved = Math.min(count, max);
      this.slots[i] = { item, count: moved };
      count -= moved;
    }
    return count;
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

  /** Move the hotbar selection by `steps`, wrapping around. */
  scrollSelection(steps: number): void {
    this.selected = (((this.selected + steps) % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  }
}
