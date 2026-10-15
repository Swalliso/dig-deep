import { describe, expect, it } from 'vitest';
import { BAG_SIZE, HOTBAR_SIZE, MAX_STACK } from '../src/config';
import { Inventory } from '../src/systems/inventory';

const SLOTS = HOTBAR_SIZE + BAG_SIZE;

describe('inventory', () => {
  it('puts new items in the first empty slot', () => {
    const inv = new Inventory();
    expect(inv.add('dirt', 5)).toBe(0);
    expect(inv.slots[0]).toEqual({ item: 'dirt', count: 5 });
  });

  it('tops up an existing stack before using an empty slot', () => {
    const inv = new Inventory();
    inv.add('dirt', 5);
    inv.add('stone', 1);
    inv.add('dirt', 3);
    expect(inv.slots[0]).toEqual({ item: 'dirt', count: 8 });
    expect(inv.slots[1]).toEqual({ item: 'stone', count: 1 });
    expect(inv.slots[2]).toBeNull();
  });

  it('uses the first empty slot, even one between other stacks', () => {
    const inv = new Inventory();
    inv.add('dirt', 1);
    inv.add('stone', 1);
    inv.add('coal', 1);
    inv.removeFromSlot(1);
    inv.add('wood', 1);
    expect(inv.slots[1]).toEqual({ item: 'wood', count: 1 });
  });

  it(`caps stacks at ${MAX_STACK} and spills into the next slot`, () => {
    const inv = new Inventory();
    inv.add('dirt', MAX_STACK - 2);
    inv.add('dirt', 5);
    expect(inv.slots[0]).toEqual({ item: 'dirt', count: MAX_STACK });
    expect(inv.slots[1]).toEqual({ item: 'dirt', count: 3 });
    expect(inv.count('dirt')).toBe(MAX_STACK + 3);
  });

  it('fills the hotbar before the bag', () => {
    const inv = new Inventory();
    const items = ['dirt', 'stone', 'deepstone', 'wood', 'planks', 'torch', 'coal', 'copper_ore', 'iron_ore', 'gold_ore'] as const;
    for (const item of items) inv.add(item, 1);
    inv.add('dirt', MAX_STACK); // slot 0 tops up to 999, the rest spills into the bag
    expect(inv.slots[HOTBAR_SIZE]).toEqual({ item: 'dirt', count: 1 });
  });

  it('returns what does not fit when full', () => {
    const inv = new Inventory();
    for (let i = 0; i < SLOTS; i++) inv.slots[i] = { item: 'stone', count: MAX_STACK };
    inv.slots[3] = { item: 'dirt', count: MAX_STACK - 2 };
    expect(inv.canAdd('dirt')).toBe(true);
    expect(inv.add('dirt', 5)).toBe(3);
    expect(inv.canAdd('dirt')).toBe(false);
    expect(inv.canAdd('coal')).toBe(false);
  });

  it('empties a slot when its last item is removed', () => {
    const inv = new Inventory();
    inv.add('dirt', 2);
    inv.removeFromSlot(0);
    expect(inv.slots[0]).toEqual({ item: 'dirt', count: 1 });
    inv.removeFromSlot(0);
    expect(inv.slots[0]).toBeNull();
  });

  it('wraps the hotbar selection when scrolling', () => {
    const inv = new Inventory();
    inv.scrollSelection(-1);
    expect(inv.selected).toBe(HOTBAR_SIZE - 1);
    inv.scrollSelection(2);
    expect(inv.selected).toBe(1);
  });
});
