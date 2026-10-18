import {
  BEAM_MAX_HEIGHT,
  CHEST_SLOTS,
  DAMP_TORCH_LIGHT,
  FLOAT_RADIUS,
  HEART_LIGHT,
  FLARE_LIGHT,
  FLARE_TIME,
  LAMP_LIGHT,
  LANTERN_LIGHT,
  CAMP_LIGHT,
  LIFT_SPEED,
  LIGHT_FALLOFF_AIR,
  MAX_STACK,
  PLANT_GROW_MAX,
  PLANT_GROW_MIN,
  SPAN_MAX,
  SUPPORT_REACH,
  TILE_SIZE,
  TORCH_LIGHT,
} from '../config';
import { Tile, type TileId } from '../world/tiles';

/** A tile texture, or a shape drawn in code with a material color. */
export type ItemIcon = TileId | { shape: 'bar' | 'pickaxe' | 'door' | 'bed' | 'lantern' | 'flare' | 'gem' | 'camp'; color: string };

export interface ItemDef {
  name: string;
  /** One short line for tooltips: what it's for. */
  description: string;
  /** More tooltip lines: how it works and its limits. */
  details?: string[];
  /** Tools don't stack (1). */
  maxStack: number;
  /** Tile placed by left-clicking an empty spot with this item selected, or null if it can't be placed. */
  placeTile: TileId | null;
  icon: ItemIcon;
  /** Set on pickaxes: the tier it mines at (index into PICKAXES). */
  pickaxeTier?: number;
  /** Left-click throws one toward the cursor (flares). */
  thrown?: boolean;
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

const bar = (name: string, color: string, description = 'Metal for crafting pickaxes.'): ItemDef => material(name, { shape: 'bar', color }, description);

const gem = (name: string, color: string, description: string): ItemDef => material(name, { shape: 'gem', color }, description);

/** "4–7 minutes": how long a planted sapling or spores take to grow. */
const growTime = `${Math.round(PLANT_GROW_MIN / 60)}–${Math.round(PLANT_GROW_MAX / 60)} minutes`;

const lamp = (name: string, tile: TileId, glow: string): ItemDef => ({
  ...block(name, tile, `A gem set in gold that glows ${glow}. Its light heals, like a torch's.`),
  details: [`Lights ${LAMP_LIGHT / LIGHT_FALLOFF_AIR} tiles around it (a torch lights ${TORCH_LIGHT / LIGHT_FALLOFF_AIR}).`],
});

/** Bricks (Phase 14a) keep heat out (Phase 14b). */
const bricks = (name: string, tile: TileId, description: string): ItemDef => ({
  ...block(name, tile, description),
  details: ['Keeps heat out: heat from lava and hot rock', "doesn't pass through it. A room sealed with", 'bricks (and a closed door) stays cool.'],
});

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
  stone: block('Stone', Tile.Stone, 'Common rock. Makes a furnace, stone tools and bricks.'),
  deepstone: block('Deepstone', Tile.Deepstone, 'Dense rock from deep down. Makes deepstone bricks.'),
  wood: material('Wood', Tile.Wood, 'From trees and giant mushrooms. Makes planks, torches and handles.'),
  planks: block('Planks', Tile.Planks, 'Building block made from wood.'),
  torch: {
    ...block('Torch', Tile.Torch, 'Lights up the dark around it.'),
    details: [
      `Lights ${TORCH_LIGHT / LIGHT_FALLOFF_AIR} tiles around it, but only ${DAMP_TORCH_LIGHT / LIGHT_FALLOFF_AIR} in the`,
      "Fungal Hollows' damp air. Glowshrooms don't mind the damp.",
    ],
  },
  workbench: block('Workbench', Tile.Workbench, 'Station for tools, the furnace and chests.'),
  furnace: block('Furnace', Tile.Furnace, 'Station that smelts ore into bars.'),
  coal: material('Coal', Tile.CoalOre, 'Fuel for torches and smelting.'),
  copper_ore: material('Copper ore', Tile.CopperOre, 'Smelt into copper bars at a furnace.'),
  iron_ore: material('Iron ore', Tile.IronOre, 'Smelt into iron bars at a furnace.'),
  gold_ore: material('Gold ore', Tile.GoldOre, 'Smelt into gold bars at a furnace.'),
  copper_bar: bar('Copper bar', '#d9783a'),
  iron_bar: bar('Iron bar', '#c9ccd2', 'Metal for the iron pickaxe, the lantern and lifts.'),
  gold_bar: bar('Gold bar', '#f2c94c', 'Metal for the gold pickaxe and gem lamps.'),
  wooden_pickaxe: pickaxe('Wooden pickaxe', 0, '#b88a52', 'Mines dirt, stone and coal.'),
  stone_pickaxe: pickaxe('Stone pickaxe', 1, '#8d8d92', 'Also mines copper ore and mudstone.'),
  copper_pickaxe: pickaxe('Copper pickaxe', 2, '#d9783a', 'Also mines iron ore and deepstone.'),
  iron_pickaxe: pickaxe('Iron pickaxe', 3, '#c9ccd2', 'Also mines gold ore, gems and basalt.'),
  gold_pickaxe: pickaxe('Gold pickaxe', 4, '#f2c94c', 'Also mines emberite ore.'),
  chest: block('Chest', Tile.Chest, `Holds ${CHEST_SLOTS} stacks. Crafting uses what is in nearby chests.`),
  ladder: block('Ladder', Tile.Ladder, 'Hold W or S on it to climb. You can stand on its top.'),
  platform: block('Platform', Tile.Platform, 'Jump up through it. S drops down through (hold S to keep dropping).'),
  gravel: {
    ...block('Gravel', Tile.Gravel, 'Loose rock. Falls when nothing holds it up from below.'),
    details: [
      'Rests only on the tile right under it.',
      'Beams, crossbeams and platforms hold it up, diagonally too.',
    ],
  },
  beam: {
    ...block('Beam', Tile.Beam, 'A post you can walk through. Holds up gravel above it.'),
    details: [
      'Stands on solid ground or on another beam.',
      `Its top holds the tile above and ${SUPPORT_REACH} to each side, diagonally.`,
      `Holds things up to ${BEAM_MAX_HEIGHT} beams high.`,
      'Take out the bottom and the beams above it break.',
    ],
  },
  crossbeam: {
    ...block('Crossbeam', Tile.Crossbeam, 'A walk-through beam that holds up gravel above it.'),
    details: [
      `Holds what's above its row, and ${SUPPORT_REACH} past each end, diagonally.`,
      `Works up to ${SPAN_MAX} tiles from where the row rests: a wall or beam`,
      'at its end, a beam or ground under it, or solid rock right above it.',
      'Platforms hold gravel the same way.',
    ],
  },
  lantern: {
    name: 'Lantern',
    description: `Lights ${LANTERN_LIGHT / LIGHT_FALLOFF_AIR} tiles around you while it's in your hand.`,
    details: [
      'Its light keeps dread away wherever you go,',
      'but health only comes back in the light of',
      'torches or the sky.',
      'Mining still works while you hold it.',
    ],
    maxStack: 1,
    placeTile: null,
    icon: { shape: 'lantern', color: '#ffcf5a' },
  },
  flare: {
    name: 'Flare',
    description: `Thrown at the cursor, it sticks and lights ${FLARE_LIGHT / LIGHT_FALLOFF_AIR} tiles around for ${FLARE_TIME} s.`,
    details: ['For scouting: its light keeps dread away,', "but like the lantern's, it doesn't heal."],
    maxStack: MAX_STACK,
    placeTile: null,
    icon: { shape: 'flare', color: '#ff5a6e' },
    thrown: true,
  },
  glowshroom: block('Glowshroom', Tile.Glowshroom, "A mushroom that glows. Its light heals, like a torch's."),
  glow_crystal: block('Glow crystal', Tile.GlowCrystal, "A crystal that glows. Its light heals, like a torch's."),
  // Placed as the bottom half; building.ts adds the top half above it.
  door: {
    ...block('Door', Tile.DoorClosedBottom, 'Two tiles tall. Right-click to open or close.'),
    details: ['Opens toward the way you face when you place it.', 'Keeps heat out while it is closed, like bricks.'],
    icon: { shape: 'door', color: '#8f6236' },
  },
  // Placed as the left half; building.ts adds the right half beside it.
  bed: { ...block('Bed', Tile.BedLeft, 'Two tiles wide. Right-click it to respawn there.'), icon: { shape: 'bed', color: '#b84a4a' } },
  // Phase 14a: each stratum's rock and its bricks.
  mudstone: block('Mudstone', Tile.Mudstone, 'Damp rock from the Fungal Hollows. Makes mudstone bricks.'),
  basalt: block('Basalt', Tile.Basalt, 'Dark rock from the Magma Layer. Makes basalt bricks.'),
  stone_bricks: bricks('Stone bricks', Tile.StoneBricks, 'A tidy building block, fired from stone.'),
  mudstone_bricks: bricks('Mudstone bricks', Tile.MudstoneBricks, 'A mossy green building block, fired from mudstone.'),
  deepstone_bricks: bricks('Deepstone bricks', Tile.DeepstoneBricks, 'A slate-blue building block, fired from deepstone.'),
  basalt_bricks: bricks('Basalt bricks', Tile.BasaltBricks, 'A dark building block, fired from basalt.'),
  // Phase 14a: the Magma Layer's ore and the Geode Depths' gems.
  emberite_ore: material('Emberite ore', Tile.EmberiteOre, 'Smelt into emberite bars at a furnace.'),
  emberite_bar: bar('Emberite bar', '#ff7a3a', 'Metal for the emberite pickaxe.'),
  emberite_pickaxe: pickaxe('Emberite pickaxe', 5, '#ff7a3a', 'The fastest pickaxe. Breaks heartstone.'),
  ruby: gem('Ruby', '#e3245e', 'A red gem from the Geode Depths. Set in gold, it makes ruby lamps.'),
  sapphire: gem('Sapphire', '#3b7cec', 'A blue gem from the Geode Depths. Set in gold, it makes sapphire lamps.'),
  ruby_lamp: lamp('Ruby lamp', Tile.RubyLamp, 'red'),
  sapphire_lamp: lamp('Sapphire lamp', Tile.SapphireLamp, 'blue'),
  // Phase 14a: renewable wood.
  sapling: {
    ...block('Sapling', Tile.Sapling, 'Plant it on grass or dirt and it grows into a tree.'),
    details: [`It grows in ${growTime} of play, once there's room.`, 'Leaves drop saplings now and then.'],
  },
  mushroom_spores: {
    ...block('Mushroom spores', Tile.MushroomSprout, 'Plant them on mudstone and a giant mushroom grows.'),
    details: [`It grows in ${growTime} of play, once there's room.`, 'Giant mushroom stems give wood, and their caps drop spores.'],
  },
  // Phase 14b: the strata's rules and the Heart of the Deep.
  floatstone: {
    ...block('Floatstone', Tile.Floatstone, 'A pale crystal from the Geode Depths that lightens gravity.'),
    details: [`Within ${FLOAT_RADIUS} tiles of one you jump higher and fall`, 'slowly, and a fall only counts from where you', 'leave its pull. Put one under a long drop.'],
  },
  heartstone: {
    ...block('Heartstone', Tile.Heartstone, "The Heart of the Deep's glowing shell. Keeps heat out."),
    details: ['Only the emberite pickaxe breaks it.'],
  },
  heart_of_the_deep: {
    ...block('Heart of the Deep', Tile.HeartCore, 'The prize at the bottom of the world.'),
    details: [`It glows ${HEART_LIGHT / LIGHT_FALLOFF_AIR} tiles around wherever you put it.`],
  },
  // Phase 15: lifts and the camp.
  lift_rail: {
    ...block('Lift rail', Tile.LiftRail, 'Build a column of it for a lift cage to ride. You can climb it too.'),
    details: [
      `The cage rides at up to ${LIFT_SPEED / TILE_SIZE} tiles a second (a ladder climbs`,
      'about 9), between the lift stops beside the rail.',
      'A gap in the rail splits it into two lifts.',
    ],
  },
  lift_stop: {
    ...block('Lift stop', Tile.LiftStop, 'Goes beside a lift rail, on a floor. Right-click it to ride.'),
    details: ['It calls the cage, and lists every stop on the', 'rail with its depth. You can rename it there.'],
  },
  // Placed as the top-left part; building.ts adds the other three.
  camp_kit: {
    ...block('Camp kit', Tile.CampTopLeft, 'A camp to set up: a workbench, a furnace and a bed in one.'),
    details: [
      'Needs a 2 x 2 space on solid ground. Setting it up',
      'makes it your respawn point. Break it to pack it up',
      'and set it up again deeper down. One camp at a time.',
      `Its stove lights ${CAMP_LIGHT / LIGHT_FALLOFF_AIR} tiles around, and its light heals`,
      "like a torch's, so it's a safe place to rest.",
    ],
    icon: { shape: 'camp', color: '#c08a3e' },
  },
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
