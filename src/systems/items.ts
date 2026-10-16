import { CHEST_SLOTS, MAX_STACK } from '../config';
import { Tile, type TileId } from '../world/tiles';

/** A tile texture, or a shape drawn in code with a material color. */
export type ItemIcon = TileId | { shape: 'bar' | 'pickaxe' | 'door'; color: string };

export interface ItemDef {
  name: string;
  /** One short line for tooltips: what it's for. */
  description: string;
  /** Tools don't stack (1). */
  maxStack: number;
  /** Tile placed by left-clicking an empty spot with this item selected, or null if it can't be placed. */
  placeTile: TileId | null;
  icon: ItemIcon;
  /** Set on pickaxes: the tier it mines at (index into PICKAXES). */
  pickaxeTier?: number;
}

const block = (name: string, tile: TileId, description: string): ItemDef => ({
  name,
  description,
  maxStack: MAX_STACK,
  placeTile: tile,
  icon: tile,
});

const material = (name: string, icon: ItemIcon, description: string): ItemDef => ({
  name,
  description,
  maxStack: MAX_STACK,
  placeTile: null,
  icon,
});

const bar = (name: string, color: string): ItemDef => material(name, { shape: 'bar', color }, 'Metal for crafting pickaxes.');

const pickaxe = (name: string, tier: number, color: string, description: string): ItemDef => ({
  name,
  description,
  maxStack: 1,
  placeTile: null,
  icon: { shape: 'pickaxe', color },
  pickaxeTier: tier,
});

/** Item registry. Keys are the item ids that tiles drop and inventories store. */
export const ITEMS = {
  dirt: block('Dirt', Tile.Dirt, 'Soft soil. Quick to dig and to build with.'),
  stone: block('Stone', Tile.Stone, 'Common rock. Makes a furnace and stone tools.'),
  deepstone: block('Deepstone', Tile.Deepstone, 'Dense rock from deep down.'),
  wood: material('Wood', Tile.Wood, 'From trees. Makes planks, torches and handles.'),
  planks: block('Planks', Tile.Planks, 'Building block made from wood.'),
  torch: block('Torch', Tile.Torch, 'Lights up the dark around it.'),
  workbench: block('Workbench', Tile.Workbench, 'Station for tools, the furnace and chests.'),
  furnace: block('Furnace', Tile.Furnace, 'Station that smelts ore into bars.'),
  coal: material('Coal', Tile.CoalOre, 'Fuel for torches and smelting.'),
  copper_ore: material('Copper ore', Tile.CopperOre, 'Smelt into copper bars at a furnace.'),
  iron_ore: material('Iron ore', Tile.IronOre, 'Smelt into iron bars at a furnace.'),
  gold_ore: material('Gold ore', Tile.GoldOre, 'Smelt into gold bars at a furnace.'),
  copper_bar: bar('Copper bar', '#d9783a'),
  iron_bar: bar('Iron bar', '#c9ccd2'),
  gold_bar: bar('Gold bar', '#f2c94c'),
  wooden_pickaxe: pickaxe('Wooden pickaxe', 0, '#b88a52', 'Mines dirt, stone and coal.'),
  stone_pickaxe: pickaxe('Stone pickaxe', 1, '#8d8d92', 'Also mines copper ore.'),
  copper_pickaxe: pickaxe('Copper pickaxe', 2, '#d9783a', 'Also mines iron ore and deepstone.'),
  iron_pickaxe: pickaxe('Iron pickaxe', 3, '#c9ccd2', 'Also mines gold ore.'),
  gold_pickaxe: pickaxe('Gold pickaxe', 4, '#f2c94c', 'The fastest pickaxe.'),
  chest: block('Chest', Tile.Chest, `Holds ${CHEST_SLOTS} stacks. Crafting uses what is in nearby chests.`),
  ladder: block('Ladder', Tile.Ladder, 'Hold W or S on it to climb. You can stand on its top.'),
  platform: block('Platform', Tile.Platform, 'Jump up through it. S + jump drops down through.'),
  // Placed as the bottom half; building.ts adds the top half above it.
  door: { ...block('Door', Tile.DoorClosedBottom, 'Two tiles tall. Right-click to open or close.'), icon: { shape: 'door', color: '#8f6236' } },
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
