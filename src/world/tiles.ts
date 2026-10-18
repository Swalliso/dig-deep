// Tile type registry. IDs are stored directly in chunk Uint8Arrays, so never renumber them.

import {
  FLOATSTONE_LIGHT,
  GLOW_CRYSTAL_LIGHT,
  GLOWSHROOM_LIGHT,
  HEART_LIGHT,
  HEARTSTONE_LIGHT,
  HOT_ROCK_HEAT,
  HOT_ROCK_LIGHT,
  LAMP_LIGHT,
  LAVA_HEAT,
  LAVA_LIGHT,
  SAPLING_CHANCE,
  SPORE_CHANCE,
  TORCH_LIGHT,
} from '../config';
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
  // Phase 14a: the strata's rock and the bricks made from it.
  Mudstone: 30,
  Basalt: 31,
  StoneBricks: 32,
  MudstoneBricks: 33,
  DeepstoneBricks: 34,
  BasaltBricks: 35,
  // Phase 14a: new ore and gems.
  EmberiteOre: 36,
  RubyOre: 37,
  SapphireOre: 38,
  // Phase 14a: giant mushrooms, and what grows trees and giant mushrooms.
  MushroomStem: 39,
  MushroomCap: 40,
  Sapling: 41,
  MushroomSprout: 42,
  // Phase 14a: gem lamps.
  RubyLamp: 43,
  SapphireLamp: 44,
  // Phase 14b: the strata's rules.
  Lava: 45,
  HotRock: 46,
  Floatstone: 47,
  Heartstone: 48,
  HeartCore: 49,
  // Phase 15: lifts (a rail column with stops beside it) and the camp, a 2 x 2 object.
  LiftRail: 50,
  LiftStop: 51,
  CampTopLeft: 52,
  CampTopRight: 53,
  CampBottomLeft: 54,
  CampBottomRight: 55,
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
  /** Glowing tiles: the color they tint the lit tiles around them (drawn only). */
  glowColor?: string;
  /** Sometimes also drops this when broken, felled with a tree included (leaves drop saplings). */
  chanceDrop?: { item: ItemId; chance: number };
  /**
   * Saplings and mushroom sprouts: what they grow into (see plants.ts) and the tiles they can be
   * planted on.
   */
  plant?: { grows: 'tree' | 'giantMushroom'; on: readonly TileId[] };
  /**
   * Lava (Phase 14b): a liquid you can walk into (it hurts) but can't mine or build in. It
   * doesn't flow.
   */
  liquid?: boolean;
  /** Heat sources (lava, hot rock): the heat level at the tile itself (see world/heat.ts). */
  heat?: number;
  /** Keeps heat out: heat doesn't spread into or through it (bricks, heartstone, closed doors). */
  insulates?: boolean;
}

const defs: TileDef[] = [
  { id: Tile.Air, name: 'Air', hardness: 0, minTier: 0, color: 'transparent', drop: null, solid: false, material: 'none' },
  { id: Tile.Grass, name: 'Grass', hardness: 0.3, minTier: 0, color: '#5a9e3a', drop: 'dirt', solid: true, material: 'grass' },
  { id: Tile.Dirt, name: 'Dirt', hardness: 0.3, minTier: 0, color: '#8a5a34', drop: 'dirt', solid: true, material: 'soil' },
  { id: Tile.Stone, name: 'Stone', hardness: 0.8, minTier: 0, color: '#7d7d82', drop: 'stone', solid: true, material: 'stone' },
  { id: Tile.Wood, name: 'Wood', hardness: 0.6, minTier: 0, color: '#7a5230', drop: 'wood', solid: false, material: 'wood' },
  { id: Tile.Leaves, name: 'Leaves', hardness: 0.1, minTier: 0, color: '#3f8a2e', drop: null, solid: false, material: 'plant', chanceDrop: { item: 'sapling', chance: SAPLING_CHANCE } },
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
  { id: Tile.DoorClosedTop, name: 'Door', hardness: 0.5, minTier: 0, color: '#8f6236', drop: 'door', solid: true, material: 'wood', insulates: true },
  { id: Tile.DoorClosedBottom, name: 'Door', hardness: 0.5, minTier: 0, color: '#8f6236', drop: 'door', solid: true, material: 'wood', insulates: true },
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
  { id: Tile.Glowshroom, name: 'Glowshroom', hardness: 0.1, minTier: 0, color: '#5fe0c8', drop: 'glowshroom', solid: false, material: 'plant', light: GLOWSHROOM_LIGHT, glowColor: '#2ee6c4' },
  { id: Tile.GlowCrystal, name: 'Glow crystal', hardness: 1.5, minTier: 2, color: '#b58cff', drop: 'glow_crystal', solid: true, material: 'ore', light: GLOW_CRYSTAL_LIGHT, glowColor: '#a66bff' },
  // Each stratum's rock needs the pickaxe made from the ore of the stratum above it (stone needs
  // none), and bricks break like the rock they're made from.
  { id: Tile.Mudstone, name: 'Mudstone', hardness: 1.1, minTier: 1, color: '#5d6650', drop: 'mudstone', solid: true, material: 'stone' },
  { id: Tile.Basalt, name: 'Basalt', hardness: 3.0, minTier: 3, color: '#3d3236', drop: 'basalt', solid: true, material: 'stone' },
  { id: Tile.StoneBricks, name: 'Stone bricks', hardness: 0.8, minTier: 0, color: '#8b8b92', drop: 'stone_bricks', solid: true, material: 'stone', insulates: true },
  { id: Tile.MudstoneBricks, name: 'Mudstone bricks', hardness: 1.1, minTier: 1, color: '#6c7a58', drop: 'mudstone_bricks', solid: true, material: 'stone', insulates: true },
  { id: Tile.DeepstoneBricks, name: 'Deepstone bricks', hardness: 2.5, minTier: 2, color: '#4c5468', drop: 'deepstone_bricks', solid: true, material: 'stone', insulates: true },
  { id: Tile.BasaltBricks, name: 'Basalt bricks', hardness: 3.0, minTier: 3, color: '#4a3b3f', drop: 'basalt_bricks', solid: true, material: 'stone', insulates: true },
  { id: Tile.EmberiteOre, name: 'Emberite ore', hardness: 3.2, minTier: 4, color: '#ff6f2e', drop: 'emberite_ore', solid: true, material: 'ore' },
  { id: Tile.RubyOre, name: 'Ruby', hardness: 2.2, minTier: 3, color: '#e3245e', drop: 'ruby', solid: true, material: 'ore' },
  { id: Tile.SapphireOre, name: 'Sapphire', hardness: 2.2, minTier: 3, color: '#3b7cec', drop: 'sapphire', solid: true, material: 'ore' },
  // A giant mushroom: a stem you can walk through (it gives wood) under a wide cap, felled like a tree.
  { id: Tile.MushroomStem, name: 'Mushroom stem', hardness: 0.5, minTier: 0, color: '#d6cab0', drop: 'wood', solid: false, material: 'wood' },
  { id: Tile.MushroomCap, name: 'Mushroom cap', hardness: 0.1, minTier: 0, color: '#8a4fb2', drop: null, solid: false, material: 'plant', chanceDrop: { item: 'mushroom_spores', chance: SPORE_CHANCE } },
  { id: Tile.Sapling, name: 'Sapling', hardness: 0.05, minTier: 0, color: '#6aa84a', drop: 'sapling', solid: false, material: 'plant', plant: { grows: 'tree', on: [Tile.Grass, Tile.Dirt] } },
  { id: Tile.MushroomSprout, name: 'Mushroom sprout', hardness: 0.05, minTier: 0, color: '#c9a8e0', drop: 'mushroom_spores', solid: false, material: 'plant', plant: { grows: 'giantMushroom', on: [Tile.Mudstone] } },
  { id: Tile.RubyLamp, name: 'Ruby lamp', hardness: 0.3, minTier: 0, color: '#ff5a7c', drop: 'ruby_lamp', solid: false, material: 'ore', light: LAMP_LIGHT, glowColor: '#ff3d6e' },
  { id: Tile.SapphireLamp, name: 'Sapphire lamp', hardness: 0.3, minTier: 0, color: '#5a9cff', drop: 'sapphire_lamp', solid: false, material: 'ore', light: LAMP_LIGHT, glowColor: '#3d8bff' },
  // Phase 14b. Lava pools don't flow; they glow, heat the tiles around them and hurt to touch.
  { id: Tile.Lava, name: 'Lava', hardness: Infinity, minTier: Infinity, color: '#ff6a1a', drop: null, solid: false, material: 'stone', light: LAVA_LIGHT, glowColor: '#ff5a14', heat: LAVA_HEAT, liquid: true },
  // Glowing basalt that heats the tiles near it; it cools into plain basalt when mined.
  { id: Tile.HotRock, name: 'Hot rock', hardness: 3.0, minTier: 3, color: '#7a2e1e', drop: 'basalt', solid: true, material: 'stone', light: HOT_ROCK_LIGHT, glowColor: '#ff4a1a', heat: HOT_ROCK_HEAT },
  // A pale crystal from the Geode Depths' caverns: gravity is lower near it (see strata.ts).
  { id: Tile.Floatstone, name: 'Floatstone', hardness: 1.5, minTier: 2, color: '#9fe8ff', drop: 'floatstone', solid: true, material: 'ore', light: FLOATSTONE_LIGHT, glowColor: '#7fdcff' },
  // The Heart of the Deep's chamber: only the emberite pickaxe breaks its walls.
  { id: Tile.Heartstone, name: 'Heartstone', hardness: 4.0, minTier: 5, color: '#5a1426', drop: 'heartstone', solid: true, material: 'stone', light: HEARTSTONE_LIGHT, glowColor: '#c4183c', insulates: true },
  { id: Tile.HeartCore, name: 'Heart of the Deep', hardness: 1.5, minTier: 0, color: '#ff3d5a', drop: 'heart_of_the_deep', solid: false, material: 'ore', light: HEART_LIGHT, glowColor: '#ff6a3d' },
  // Phase 15. A lift rail is climbed like a ladder; the cage rides it (see systems/lifts.ts).
  { id: Tile.LiftRail, name: 'Lift rail', hardness: 0.4, minTier: 0, color: '#8f969e', drop: 'lift_rail', solid: false, material: 'ore', climbable: true },
  { id: Tile.LiftStop, name: 'Lift stop', hardness: 0.4, minTier: 0, color: '#e0b040', drop: 'lift_stop', solid: false, material: 'ore' },
  // Any part of the camp drops the camp kit; breaking one part packs up the rest (see camp.ts).
  { id: Tile.CampTopLeft, name: 'Camp', hardness: 0.6, minTier: 0, color: '#c08a3e', drop: 'camp_kit', solid: false, material: 'wood' },
  { id: Tile.CampTopRight, name: 'Camp', hardness: 0.6, minTier: 0, color: '#c08a3e', drop: 'camp_kit', solid: false, material: 'wood' },
  { id: Tile.CampBottomLeft, name: 'Camp', hardness: 0.6, minTier: 0, color: '#c08a3e', drop: 'camp_kit', solid: false, material: 'wood' },
  { id: Tile.CampBottomRight, name: 'Camp', hardness: 0.6, minTier: 0, color: '#c08a3e', drop: 'camp_kit', solid: false, material: 'wood' },
];

/** Indexed by tile id. */
export const TILES: readonly TileDef[] = defs;

export const TILE_COUNT = TILES.length;

/** Tiles that glint when lit (ores and gems), in the order the debug ore patch lays them out. */
export const ORE_TILES: readonly TileId[] = [
  Tile.CoalOre,
  Tile.CopperOre,
  Tile.IronOre,
  Tile.GoldOre,
  Tile.RubyOre,
  Tile.SapphireOre,
  Tile.EmberiteOre,
];

export function tileDef(id: number): TileDef {
  return TILES[id] ?? TILES[Tile.Air];
}

/**
 * What a broken tile drops besides its usual drop, given a random number r in 0..1: now and then
 * a sapling from leaves, or spores from a giant mushroom's cap. Null most of the time.
 */
export function chanceDropFor(id: number, r: number): ItemId | null {
  const extra = tileDef(id).chanceDrop;
  return extra && r < extra.chance ? extra.item : null;
}

/** Light level each tile id gives off (0 for most), indexed by id. */
export const TILE_LIGHT: Uint8Array = Uint8Array.from(TILES, (def) => def.light ?? 0);

/** Heat each tile id gives off (0 for most), indexed by id. */
export const TILE_HEAT: Uint8Array = Uint8Array.from(TILES, (def) => def.heat ?? 0);

/** Which tile ids keep heat out, indexed by id. */
export const TILE_INSULATES: Uint8Array = Uint8Array.from(TILES, (def) => (def.insulates ? 1 : 0));

export function isLiquid(id: number): boolean {
  return tileDef(id).liquid === true;
}

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
