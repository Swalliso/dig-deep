// Tile type registry. IDs are stored directly in chunk Uint8Arrays, so never renumber them.

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
} as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

export interface TileDef {
  id: TileId;
  name: string;
  /** Seconds to break with the starter pickaxe. Infinity = unbreakable. */
  hardness: number;
  /** Lowest pickaxe tier that can mine it. */
  minTier: number;
  /** Base color: texture fill and break particles. */
  color: string;
  /** Item id dropped when broken, or null. Items are defined in a later phase. */
  drop: string | null;
  /** Blocks movement. Tree trunks, leaves and torches can be walked through. */
  solid: boolean;
}

const defs: TileDef[] = [
  { id: Tile.Air, name: 'Air', hardness: 0, minTier: 0, color: 'transparent', drop: null, solid: false },
  { id: Tile.Grass, name: 'Grass', hardness: 0.3, minTier: 0, color: '#5a9e3a', drop: 'dirt', solid: true },
  { id: Tile.Dirt, name: 'Dirt', hardness: 0.3, minTier: 0, color: '#8a5a34', drop: 'dirt', solid: true },
  { id: Tile.Stone, name: 'Stone', hardness: 0.8, minTier: 0, color: '#7d7d82', drop: 'stone', solid: true },
  { id: Tile.Wood, name: 'Wood', hardness: 0.6, minTier: 0, color: '#7a5230', drop: 'wood', solid: false },
  { id: Tile.Leaves, name: 'Leaves', hardness: 0.1, minTier: 0, color: '#3f8a2e', drop: null, solid: false },
  { id: Tile.CoalOre, name: 'Coal ore', hardness: 1.0, minTier: 0, color: '#26262a', drop: 'coal', solid: true },
  { id: Tile.CopperOre, name: 'Copper ore', hardness: 1.2, minTier: 1, color: '#d9783a', drop: 'copper_ore', solid: true },
  { id: Tile.IronOre, name: 'Iron ore', hardness: 1.6, minTier: 2, color: '#d8b49a', drop: 'iron_ore', solid: true },
  { id: Tile.GoldOre, name: 'Gold ore', hardness: 2.0, minTier: 3, color: '#f2c94c', drop: 'gold_ore', solid: true },
  { id: Tile.Deepstone, name: 'Deepstone', hardness: 2.5, minTier: 2, color: '#3e4454', drop: 'deepstone', solid: true },
  { id: Tile.Bedrock, name: 'Bedrock', hardness: Infinity, minTier: Infinity, color: '#1c1c20', drop: null, solid: true },
  { id: Tile.Torch, name: 'Torch', hardness: 0.05, minTier: 0, color: '#ffb347', drop: 'torch', solid: false },
  { id: Tile.Planks, name: 'Planks', hardness: 0.4, minTier: 0, color: '#b88a52', drop: 'planks', solid: true },
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
