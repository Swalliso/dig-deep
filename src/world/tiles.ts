// Tile type registry. IDs are stored directly in chunk Uint8Arrays, so never renumber them.

import { GLOW_CRYSTAL_LIGHT, GLOWSHROOM_LIGHT, TORCH_LIGHT } from '../config';
import type { ItemId } from '../systems/items';
import type { World } from './world';

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
  Ladder: 17,
  Platform: 18,
  // A door is two tiles, one above the other; open and closed are separate tiles.
  DoorClosedTop: 19,
  DoorClosedBottom: 20,
  DoorOpenTop: 21,
  DoorOpenBottom: 22,
  // A bed is two tiles side by side: the head (pillow) on the left, the foot on the right.
  BedLeft: 23,
  BedRight: 24,
  // Phase 12: loose gravel, and the supports that hold it up.
  Gravel: 25,
  Beam: 26,
  Crossbeam: 27,
  // Phase 13: natural light.
  Glowshroom: 28,
  GlowCrystal: 29,
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
  /** Ladders: hold W/S on it to climb. Its top tile is also a one-way floor. */
  climbable?: boolean;
  /** Platforms: a floor you can jump up through and drop down through (S + jump). */
  oneWay?: boolean;
  /** Gravel: falls when nothing holds it up from below (see supports.ts). */
  loose?: boolean;
  /**
   * Holds up loose tiles resting on it, if it's anchored (see supports.ts): a 'post' (beam)
   * stands on firm ground, a 'span' (crossbeam, platform) rests on a wall, a beam or the ground
   * within SPAN_MAX tiles.
   */
  support?: 'post' | 'span';
  /** Light sources (torches, glowing tiles): the light level at the tile itself. */
  light?: number;
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
  { id: Tile.Torch, name: 'Torch', hardness: 0.05, minTier: 0, color: '#ffb347', drop: 'torch', solid: false, material: 'wood', light: TORCH_LIGHT },
  { id: Tile.Planks, name: 'Planks', hardness: 0.4, minTier: 0, color: '#b88a52', drop: 'planks', solid: true, material: 'wood' },
  { id: Tile.Workbench, name: 'Workbench', hardness: 0.5, minTier: 0, color: '#a0703c', drop: 'workbench', solid: false, material: 'wood' },
  { id: Tile.Furnace, name: 'Furnace', hardness: 1.0, minTier: 0, color: '#6e6e74', drop: 'furnace', solid: false, material: 'stone' },
  { id: Tile.Chest, name: 'Chest', hardness: 0.5, minTier: 0, color: '#9a6834', drop: 'chest', solid: false, material: 'wood' },
  { id: Tile.Ladder, name: 'Ladder', hardness: 0.3, minTier: 0, color: '#a87a46', drop: 'ladder', solid: false, material: 'wood', climbable: true },
  { id: Tile.Platform, name: 'Platform', hardness: 0.3, minTier: 0, color: '#b88a52', drop: 'platform', solid: false, material: 'wood', oneWay: true, support: 'span' },
  // Either half of a door drops the door; breaking one half removes the other (see doors.ts).
  { id: Tile.DoorClosedTop, name: 'Door', hardness: 0.5, minTier: 0, color: '#8f6236', drop: 'door', solid: true, material: 'wood' },
  { id: Tile.DoorClosedBottom, name: 'Door', hardness: 0.5, minTier: 0, color: '#8f6236', drop: 'door', solid: true, material: 'wood' },
  { id: Tile.DoorOpenTop, name: 'Door', hardness: 0.5, minTier: 0, color: '#8f6236', drop: 'door', solid: false, material: 'wood' },
  { id: Tile.DoorOpenBottom, name: 'Door', hardness: 0.5, minTier: 0, color: '#8f6236', drop: 'door', solid: false, material: 'wood' },
  // Either half of a bed drops the bed; breaking one half removes the other (see beds.ts).
  { id: Tile.BedLeft, name: 'Bed', hardness: 0.5, minTier: 0, color: '#b84a4a', drop: 'bed', solid: false, material: 'wood' },
  { id: Tile.BedRight, name: 'Bed', hardness: 0.5, minTier: 0, color: '#b84a4a', drop: 'bed', solid: false, material: 'wood' },
  { id: Tile.Gravel, name: 'Gravel', hardness: 0.5, minTier: 0, color: '#a39a8c', drop: 'gravel', solid: true, material: 'soil', loose: true },
  // A vertical post you can walk through, and a horizontal beam along the top of its tile.
  { id: Tile.Beam, name: 'Beam', hardness: 0.25, minTier: 0, color: '#9c7240', drop: 'beam', solid: false, material: 'wood', support: 'post' },
  { id: Tile.Crossbeam, name: 'Crossbeam', hardness: 0.25, minTier: 0, color: '#9c7240', drop: 'crossbeam', solid: false, material: 'wood', support: 'span' },
  // Natural light: a mushroom you can walk through, and a crystal set in the rock.
  { id: Tile.Glowshroom, name: 'Glowshroom', hardness: 0.1, minTier: 0, color: '#5fe0c8', drop: 'glowshroom', solid: false, material: 'plant', light: GLOWSHROOM_LIGHT },
  { id: Tile.GlowCrystal, name: 'Glow crystal', hardness: 1.5, minTier: 2, color: '#b58cff', drop: 'glow_crystal', solid: true, material: 'ore', light: GLOW_CRYSTAL_LIGHT },
];

/** Indexed by tile id. */
export const TILES: readonly TileDef[] = defs;

export const TILE_COUNT = TILES.length;

export const ORE_TILES: readonly TileId[] = [Tile.CoalOre, Tile.CopperOre, Tile.IronOre, Tile.GoldOre];

export function tileDef(id: number): TileDef {
  return TILES[id] ?? TILES[Tile.Air];
}

/** Light level each tile id gives off (0 for most), indexed by id. */
export const TILE_LIGHT: Uint8Array = Uint8Array.from(TILES, (def) => def.light ?? 0);

export function isSolid(id: number): boolean {
  return tileDef(id).solid;
}

export function isClimbable(id: number): boolean {
  return tileDef(id).climbable === true;
}

/**
 * Can the player stand on top of (tx, ty)? Solid tiles, platforms, and the top tile of a ladder
 * (so you can walk across a ladder shaft and climb down from it).
 */
export function isFloor(world: World, tx: number, ty: number): boolean {
  return isSolid(world.getTile(tx, ty)) || isOneWayFloor(world, tx, ty);
}

/** A floor you can jump up through: a platform, or the top tile of a ladder. */
export function isOneWayFloor(world: World, tx: number, ty: number): boolean {
  const def = tileDef(world.getTile(tx, ty));
  if (def.oneWay) return true;
  return def.climbable === true && !isClimbable(world.getTile(tx, ty - 1));
}
