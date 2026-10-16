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

  it('never stacks tools', () => {
    const inv = new Inventory();
    inv.add('stone_pickaxe', 1);
    inv.add('stone_pickaxe', 1);
    expect(inv.slots[0]).toEqual({ item: 'stone_pickaxe', count: 1 });
    expect(inv.slots[1]).toEqual({ item: 'stone_pickaxe', count: 1 });
  });

  it('starts with a wooden pickaxe and 10 torches', () => {
    const inv = Inventory.withStartingItems();
    expect(inv.count('wooden_pickaxe')).toBe(1);
    expect(inv.count('torch')).toBe(10);
    expect(inv.bestPickaxeTier()).toBe(0);
  });

  it('uses the best pickaxe carried, wherever it is', () => {
    const inv = Inventory.withStartingItems();
    inv.slots[25] = { item: 'copper_pickaxe', count: 1 };
    inv.add('stone_pickaxe', 1);
    expect(inv.bestPickaxeTier()).toBe(2);
    expect(new Inventory().bestPickaxeTier()).toBe(-1);
  });

  it('removes items from the bag end first and refuses when short', () => {
    const inv = new Inventory();
    inv.slots[0] = { item: 'wood', count: 5 };
    inv.slots[15] = { item: 'wood', count: 3 };
    expect(inv.remove('wood', 10)).toBe(false);
    expect(inv.count('wood')).toBe(8);
    expect(inv.remove('wood', 4)).toBe(true);
    expect(inv.slots[15]).toBeNull();
    expect(inv.slots[0]).toEqual({ item: 'wood', count: 4 });
  });
});

describe('inventory panel clicks', () => {
  it('picks a stack up and puts it down in an empty slot', () => {
    const inv = new Inventory();
    inv.add('dirt', 7);
    inv.clickSlot(0);
    expect(inv.cursor).toEqual({ item: 'dirt', count: 7 });
    expect(inv.slots[0]).toBeNull();
    inv.clickSlot(12);
    expect(inv.cursor).toBeNull();
    expect(inv.slots[12]).toEqual({ item: 'dirt', count: 7 });
  });

  it('swaps the held stack with a different item', () => {
    const inv = new Inventory();
    inv.slots[0] = { item: 'dirt', count: 7 };
    inv.slots[1] = { item: 'stone', count: 2 };
    inv.clickSlot(0);
    inv.clickSlot(1);
    expect(inv.slots[1]).toEqual({ item: 'dirt', count: 7 });
    expect(inv.cursor).toEqual({ item: 'stone', count: 2 });
  });

  it('merges the held stack into the same item, keeping any overflow', () => {
    const inv = new Inventory();
    inv.slots[0] = { item: 'dirt', count: 10 };
    inv.slots[1] = { item: 'dirt', count: MAX_STACK - 4 };
    inv.clickSlot(0);
    inv.clickSlot(1);
    expect(inv.slots[1]).toEqual({ item: 'dirt', count: MAX_STACK });
    expect(inv.cursor).toEqual({ item: 'dirt', count: 6 });
  });

  it('shift-click moves hotbar stacks to the bag and back, merging first', () => {
    const inv = new Inventory();
    inv.slots[2] = { item: 'coal', count: 4 };
    inv.slots[HOTBAR_SIZE + 5] = { item: 'coal', count: 10 };
    inv.quickMove(2);
    expect(inv.slots[2]).toBeNull();
    expect(inv.slots[HOTBAR_SIZE + 5]).toEqual({ item: 'coal', count: 14 });

    inv.slots[0] = { item: 'dirt', count: 1 };
    inv.quickMove(HOTBAR_SIZE + 5);
    expect(inv.slots[HOTBAR_SIZE + 5]).toBeNull();
    expect(inv.slots[1]).toEqual({ item: 'coal', count: 14 });
  });

  it('shift-click leaves what does not fit', () => {
    const inv = new Inventory();
    for (let i = 0; i < HOTBAR_SIZE; i++) inv.slots[i] = { item: 'stone', count: MAX_STACK };
    inv.slots[HOTBAR_SIZE] = { item: 'dirt', count: 5 };
    inv.quickMove(HOTBAR_SIZE);
    expect(inv.slots[HOTBAR_SIZE]).toEqual({ item: 'dirt', count: 5 });
  });

  it('puts the held stack back when the panel closes', () => {
    const inv = new Inventory();
    inv.add('wood', 3);
    inv.clickSlot(0);
    expect(inv.returnCursor()).toBeNull();
    expect(inv.cursor).toBeNull();
    expect(inv.slots[0]).toEqual({ item: 'wood', count: 3 });
  });
});

describe('trash slot', () => {
  it('destroys a stack put in it, but the last one can be taken back', () => {
    const inv = new Inventory();
    inv.slots[0] = { item: 'dirt', count: 40 };
    inv.slots[1] = { item: 'stone', count: 3 };
    inv.clickSlot(0);
    inv.clickTrash();
    expect(inv.cursor).toBeNull();
    expect(inv.count('dirt')).toBe(0);
    expect(inv.trash).toEqual({ item: 'dirt', count: 40 });

    // Trashing something else replaces it for good.
    inv.clickSlot(1);
    inv.clickTrash();
    expect(inv.trash).toEqual({ item: 'stone', count: 3 });

    inv.clickTrash(); // nothing held: take it back
    expect(inv.cursor).toEqual({ item: 'stone', count: 3 });
    expect(inv.trash).toBeNull();
  });
});

describe('pick block (middle click)', () => {
  it('selects a hotbar slot that already holds the item', () => {
    const inv = new Inventory();
    inv.slots[4] = { item: 'stone', count: 9 };
    expect(inv.pick('stone')).toBe(true);
    expect(inv.selected).toBe(4);
  });

  it('brings the item up from the bag into the selected slot if it is empty', () => {
    const inv = new Inventory();
    inv.slots[0] = { item: 'wooden_pickaxe', count: 1 };
    inv.slots[HOTBAR_SIZE + 3] = { item: 'planks', count: 20 };
    inv.selected = 6;
    expect(inv.pick('planks')).toBe(true);
    expect(inv.selected).toBe(6);
    expect(inv.slots[6]).toEqual({ item: 'planks', count: 20 });
    expect(inv.slots[HOTBAR_SIZE + 3]).toBeNull();
  });

  it('otherwise uses the first empty hotbar slot, or swaps with the selected stack', () => {
    const inv = new Inventory();
    inv.slots[0] = { item: 'wooden_pickaxe', count: 1 };
    inv.slots[HOTBAR_SIZE] = { item: 'planks', count: 20 };
    inv.selected = 0;
    expect(inv.pick('planks')).toBe(true);
    expect(inv.selected).toBe(1);
    expect(inv.slots[0]).toEqual({ item: 'wooden_pickaxe', count: 1 });

    for (let i = 0; i < HOTBAR_SIZE; i++) inv.slots[i] = { item: 'dirt', count: 1 };
    inv.slots[HOTBAR_SIZE + 1] = { item: 'stone', count: 5 };
    inv.selected = 3;
    expect(inv.pick('stone')).toBe(true);
    expect(inv.slots[3]).toEqual({ item: 'stone', count: 5 });
    expect(inv.slots[HOTBAR_SIZE + 1]).toEqual({ item: 'dirt', count: 1 });
  });

  it('does nothing when the item is not carried', () => {
    const inv = new Inventory();
    inv.selected = 2;
    expect(inv.pick('stone')).toBe(false);
    expect(inv.selected).toBe(2);
  });
});
