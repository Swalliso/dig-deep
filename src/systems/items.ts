import { MAX_STACK } from '../config';
import { Tile, type TileId } from '../world/tiles';

export interface ItemDef {
  name: string;
  maxStack: number;
  /** Tile placed by right-clicking with this item selected, or null if it can't be placed. */
  placeTile: TileId | null;
  /** Tile texture used as the item's icon. */
  iconTile: TileId;
}

/** Item registry. Keys are the item ids that tiles drop and inventories store. */
export const ITEMS = {
  dirt: { name: 'Dirt', maxStack: MAX_STACK, placeTile: Tile.Dirt, iconTile: Tile.Dirt },
  stone: { name: 'Stone', maxStack: MAX_STACK, placeTile: Tile.Stone, iconTile: Tile.Stone },
  deepstone: { name: 'Deepstone', maxStack: MAX_STACK, placeTile: Tile.Deepstone, iconTile: Tile.Deepstone },
  wood: { name: 'Wood', maxStack: MAX_STACK, placeTile: null, iconTile: Tile.Wood },
  planks: { name: 'Planks', maxStack: MAX_STACK, placeTile: Tile.Planks, iconTile: Tile.Planks },
  torch: { name: 'Torch', maxStack: MAX_STACK, placeTile: Tile.Torch, iconTile: Tile.Torch },
  coal: { name: 'Coal', maxStack: MAX_STACK, placeTile: null, iconTile: Tile.CoalOre },
  copper_ore: { name: 'Copper ore', maxStack: MAX_STACK, placeTile: null, iconTile: Tile.CopperOre },
  iron_ore: { name: 'Iron ore', maxStack: MAX_STACK, placeTile: null, iconTile: Tile.IronOre },
  gold_ore: { name: 'Gold ore', maxStack: MAX_STACK, placeTile: null, iconTile: Tile.GoldOre },
} satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

export function itemDef(id: ItemId): ItemDef {
  return ITEMS[id];
}
