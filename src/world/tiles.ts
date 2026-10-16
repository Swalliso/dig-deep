// Tile type registry. IDs are stored directly in chunk Uint8Arrays, so never renumber them.

import type { ItemId } from '../systems/items';

export const Tile = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Wood: 4,
  Leaves: 5,
  CoalOre: 6,
  CopperOre: 7,
  IronOre: 8,
  GoldOre: 9,
  Deepstone: 10,
  Bedrock: 11,
  Torch: 12,
  Planks: 13,
  Workbench: 14,
  Furnace: 15,
  Chest: 16,
} as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

/** What a tile sounds like when it's dug, broken, placed or walked on. */
export type TileMaterial = 'none' | 'soil' | 'grass' | 'stone' | 'ore' | 'wood' | 'plant';

export interface TileDef {
  id: TileId;
  name: string;
  /** Seconds to break with the starter pickaxe. Infinity = unbreakable. */
  hardness: number;
  /** Lowest pickaxe tier that can mine it. */
  minTier: number;
  /** Base color: texture fill and break particles. */
  color: string;
  /** Item dropped when broken, or null. */
  drop: ItemId | null;
  /** Blocks movement. Tree trunks, leaves, torches, crafting stations and chests can be walked through. */
  solid: boolean;
  /** Picks its break, place and footstep sounds. */
  material: TileMaterial;
}

const defs: TileDef[] = [
  { id: Tile.Air, name: 'Air', hardness: 0, minTier: 0, color: 'transparent', drop: null, solid: false, material: 'none' },
  { id: Tile.Grass, name: 'Grass', hardness: 0.3, minTier: 0, color: '#5a9e3a', drop: 'dirt', solid: true, material: 'grass' },
  { id: Tile.Dirt, name: 'Dirt', hardness: 0.3, minTier: 0, color: '#8a5a34', drop: 'dirt', solid: true, material: 'soil' },
  { id: Tile.Stone, name: 'Stone', hardness: 0.8, minTier: 0, color: '#7d7d82', drop: 'stone', solid: true, material: 'stone' },
  { id: Tile.Wood, name: 'Wood', hardness: 0.6, minTier: 0, color: '#7a5230', drop: 'wood', solid: false, material: 'wood' },
  { id: Tile.Leaves, name: 'Leaves', hardness: 0.1, minTier: 0, color: '#3f8a2e', drop: null, solid: false, material: 'plant' },
  { id: Tile.CoalOre, name: 'Coal ore', hardness: 1.0, minTier: 0, color: '#26262a', drop: 'coal', solid: true, material: 'ore' },
  { id: Tile.CopperOre, name: 'Copper ore', hardness: 1.2, minTier: 1, color: '#d9783a', drop: 'copper_ore', solid: true, material: 'ore' },
  { id: Tile.IronOre, name: 'Iron ore', hardness: 1.6, minTier: 2, color: '#d8b49a', drop: 'iron_ore', solid: true, material: 'ore' },
  { id: Tile.GoldOre, name: 'Gold ore', hardness: 2.0, minTier: 3, color: '#f2c94c', drop: 'gold_ore', solid: true, material: 'ore' },
  { id: Tile.Deepstone, name: 'Deepstone', hardness: 2.5, minTier: 2, color: '#3e4454', drop: 'deepstone', solid: true, material: 'stone' },
  { id: Tile.Bedrock, name: 'Bedrock', hardness: Infinity, minTier: Infinity, color: '#1c1c20', drop: null, solid: true, material: 'stone' },
  { id: Tile.Torch, name: 'Torch', hardness: 0.05, minTier: 0, color: '#ffb347', drop: 'torch', solid: false, material: 'wood' },
  { id: Tile.Planks, name: 'Planks', hardness: 0.4, minTier: 0, color: '#b88a52', drop: 'planks', solid: true, material: 'wood' },
  { id: Tile.Workbench, name: 'Workbench', hardness: 0.5, minTier: 0, color: '#a0703c', drop: 'workbench', solid: false, material: 'wood' },
  { id: Tile.Furnace, name: 'Furnace', hardness: 1.0, minTier: 0, color: '#6e6e74', drop: 'furnace', solid: false, material: 'stone' },
  { id: Tile.Chest, name: 'Chest', hardness: 0.5, minTier: 0, color: '#9a6834', drop: 'chest', solid: false, material: 'wood' },
];

/** Indexed by tile id. */
export const TILES: readonly TileDef[] = defs;

export const TILE_COUNT = TILES.length;

export const ORE_TILES: readonly TileId[] = [Tile.CoalOre, Tile.CopperOre, Tile.IronOre, Tile.GoldOre];

export function tileDef(id: number): TileDef {
  return TILES[id] ?? TILES[Tile.Air];
}

export function isSolid(id: number): boolean {
  return tileDef(id).solid;
}
