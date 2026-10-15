import { MAX_STACK } from '../config';
import { Tile, type TileId } from '../world/tiles';

/** A tile texture, or a shape drawn in code with a material color. */
export type ItemIcon = TileId | { shape: 'bar' | 'pickaxe'; color: string };

export interface ItemDef {
  name: string;
  /** Tools don't stack (1). */
  maxStack: number;
  /** Tile placed by right-clicking with this item selected, or null if it can't be placed. */
  placeTile: TileId | null;
  icon: ItemIcon;
  /** Set on pickaxes: the tier it mines at (index into PICKAXES). */
  pickaxeTier?: number;
}

const bar = (name: string, color: string): ItemDef => ({
  name,
  maxStack: MAX_STACK,
  placeTile: null,
  icon: { shape: 'bar', color },
});

const pickaxe = (name: string, tier: number, color: string): ItemDef => ({
  name,
  maxStack: 1,
  placeTile: null,
  icon: { shape: 'pickaxe', color },
  pickaxeTier: tier,
});

/** Item registry. Keys are the item ids that tiles drop and inventories store. */
export const ITEMS = {
  dirt: { name: 'Dirt', maxStack: MAX_STACK, placeTile: Tile.Dirt, icon: Tile.Dirt },
  stone: { name: 'Stone', maxStack: MAX_STACK, placeTile: Tile.Stone, icon: Tile.Stone },
  deepstone: { name: 'Deepstone', maxStack: MAX_STACK, placeTile: Tile.Deepstone, icon: Tile.Deepstone },
  wood: { name: 'Wood', maxStack: MAX_STACK, placeTile: null, icon: Tile.Wood },
  planks: { name: 'Planks', maxStack: MAX_STACK, placeTile: Tile.Planks, icon: Tile.Planks },
  torch: { name: 'Torch', maxStack: MAX_STACK, placeTile: Tile.Torch, icon: Tile.Torch },
  workbench: { name: 'Workbench', maxStack: MAX_STACK, placeTile: Tile.Workbench, icon: Tile.Workbench },
  furnace: { name: 'Furnace', maxStack: MAX_STACK, placeTile: Tile.Furnace, icon: Tile.Furnace },
  coal: { name: 'Coal', maxStack: MAX_STACK, placeTile: null, icon: Tile.CoalOre },
  copper_ore: { name: 'Copper ore', maxStack: MAX_STACK, placeTile: null, icon: Tile.CopperOre },
  iron_ore: { name: 'Iron ore', maxStack: MAX_STACK, placeTile: null, icon: Tile.IronOre },
  gold_ore: { name: 'Gold ore', maxStack: MAX_STACK, placeTile: null, icon: Tile.GoldOre },
  copper_bar: bar('Copper bar', '#d9783a'),
  iron_bar: bar('Iron bar', '#c9ccd2'),
  gold_bar: bar('Gold bar', '#f2c94c'),
  wooden_pickaxe: pickaxe('Wooden pickaxe', 0, '#b88a52'),
  stone_pickaxe: pickaxe('Stone pickaxe', 1, '#8d8d92'),
  copper_pickaxe: pickaxe('Copper pickaxe', 2, '#d9783a'),
  iron_pickaxe: pickaxe('Iron pickaxe', 3, '#c9ccd2'),
  gold_pickaxe: pickaxe('Gold pickaxe', 4, '#f2c94c'),
} satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

/** Every item id, in registry order. An item's index here is its slot in the icon atlas. */
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const INDEX = new Map(ITEM_IDS.map((id, i) => [id, i]));

export function itemDef(id: ItemId): ItemDef {
  return ITEMS[id];
}

export function itemIndex(id: ItemId): number {
  return INDEX.get(id) ?? 0;
}
