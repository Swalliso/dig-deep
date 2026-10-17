import { BEDROCK_BOTTOM_ROWS, SURFACE_LEVEL, WORLD_HEIGHT } from '../config';
import { ORE_LAYERS } from '../world/generate';
import { tileDef } from '../world/tiles';
import type { Chest } from './chests';
import { availableCount, canCraft, RECIPES, type Recipe, type Station } from './crafting';
import type { Inventory } from './inventory';
import { itemDef, ITEM_IDS, type ItemId } from './items';

// The next goal: one pinned recipe, shown on the HUD with what's still missing and where to
// craft it, and the crafting panel's suggestion for the next pickaxe, with where its ore is
// found. No quests: the player picks the goal.

/** The recipe that makes `item`, if any. Each item has at most one recipe. */
export function recipeFor(item: ItemId): Recipe | null {
  return RECIPES.find((r) => r.output === item) ?? null;
}

/** A pinned recipe from a save: the output item it makes, or null if it's missing or unknown. */
export function restorePinnedRecipe(saved: unknown): ItemId | null {
  return typeof saved === 'string' && (ITEM_IDS as readonly string[]).includes(saved) && recipeFor(saved as ItemId) ? (saved as ItemId) : null;
}

/** The deepest depth (m) a player can dig to: the top of the bedrock floor. */
const WORLD_BOTTOM_DEPTH = WORLD_HEIGHT - BEDROCK_BOTTOM_ROWS - SURFACE_LEVEL;

/** Where a raw material is found: "30–250 m down", or null for items that are made, not found. */
export function whereFound(item: ItemId): string | null {
  const ore = ORE_LAYERS.find((layer) => tileDef(layer.tile).drop === item);
  if (ore) {
    const { minDepth, maxDepth } = ore.spec;
    return maxDepth >= WORLD_BOTTOM_DEPTH ? `from ${minDepth} m down` : `${minDepth}–${maxDepth} m down`;
  }
  if (item === 'stone') return 'under the dirt';
  if (item === 'wood') return 'from trees';
  return null;
}

/** One ingredient of the pinned recipe. */
export interface GoalIngredient {
  item: ItemId;
  need: number;
  /** Carried plus in the chests crafting can reach. */
  have: number;
  /** Where to find it, for raw materials (see whereFound). */
  where: string | null;
}

/** How the pinned recipe stands. */
export interface GoalStatus {
  recipe: Recipe;
  ingredients: GoalIngredient[];
  /** Is its station near (true when it needs none)? */
  stationNear: boolean;
  /** Can it be crafted right here, right now? */
  ready: boolean;
}

export function goalStatus(recipe: Recipe, inventory: Inventory, stations: ReadonlySet<Station>, chests: readonly Chest[]): GoalStatus {
  return {
    recipe,
    ingredients: recipe.ingredients.map(({ item, count }) => ({
      item,
      need: count,
      have: availableCount(inventory, item, chests),
      where: whereFound(item),
    })),
    stationNear: recipe.station === null || stations.has(recipe.station),
    ready: canCraft(inventory, recipe, stations, chests),
  };
}

/** The next pickaxe to aim for and the material it's made from. */
export interface PickaxeSuggestion {
  recipe: Recipe;
  /** The pickaxe's main ingredient (stone, or a bar). */
  material: ItemId;
  /** The ore the material is smelted from, or null when the material is dug up as it is (stone). */
  ore: ItemId | null;
}

/** The lowest-tier pickaxe recipe above `tier` (the best pickaxe carried), or null if there's none. */
export function nextPickaxe(tier: number): PickaxeSuggestion | null {
  let best: Recipe | null = null;
  for (const recipe of RECIPES) {
    const t = itemDef(recipe.output).pickaxeTier;
    if (t !== undefined && t > tier && (best === null || t < itemDef(best.output).pickaxeTier!)) best = recipe;
  }
  if (!best) return null;
  const material = best.ingredients[0].item;
  const smelt = recipeFor(material);
  const ore = smelt?.ingredients.find((i) => whereFound(i.item) !== null)?.item ?? null;
  return { recipe: best, material, ore };
}

/** The suggestion's note on where its material comes from: "Copper ore: 30–250 m down, smelted at a furnace". */
export function pickaxeNote(suggestion: PickaxeSuggestion): string {
  const raw = suggestion.ore ?? suggestion.material;
  const name = itemDef(raw).name;
  const smelt = recipeFor(suggestion.material);
  const station = smelt?.station ? `, smelted at a ${smelt.station}` : '';
  return `${name}: ${whereFound(raw) ?? 'crafted'}${suggestion.ore ? station : ''}`;
}
