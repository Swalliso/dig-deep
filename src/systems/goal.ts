import { CLASSIC_PROFILE, type GenProfile } from '../world/generate';
import { depthRange, STRATA, WORLD_BOTTOM_DEPTH } from '../world/strata';
import { tileDef } from '../world/tiles';
import type { Chest } from './chests';
import { availableCount, canCraft, RECIPES, type Recipe, type Station } from './crafting';
import type { Inventory } from './inventory';
import { itemDef, ITEM_IDS, type ItemId } from './items';

// The next goal: one pinned recipe, shown on the HUD with what's still missing and where to
// craft it, and the crafting panel's suggestion for the next pickaxe, with where its ore is
// found. No quests: the player picks the goal. Where things are found depends on the world's
// generation profile (strata worlds have their own ore bands).

/** The recipe that makes `item`, if any. Each item has at most one recipe. */
export function recipeFor(item: ItemId): Recipe | null {
  return RECIPES.find((r) => r.output === item) ?? null;
}

/** A pinned recipe from a save: the output item it makes, or null if it's missing or unknown. */
export function restorePinnedRecipe(saved: unknown): ItemId | null {
  return typeof saved === 'string' && (ITEM_IDS as readonly string[]).includes(saved) && recipeFor(saved as ItemId) ? (saved as ItemId) : null;
}

/** "Fungal Hollows, 110–230 m down" */
function inStratum(s: number): string {
  return `${STRATA[s].name}, ${depthRange(s)} down`;
}

/**
 * Where a raw material is found in a world generated with `profile`: "30–250 m down", or in a
 * strata world the stratum, "Fungal Hollows, 110–230 m down". Null for items that are made, not
 * found (or that this world doesn't have).
 */
export function whereFound(item: ItemId, profile: GenProfile = CLASSIC_PROFILE): string | null {
  const ore = profile.ores.find((layer) => tileDef(layer.tile).drop === item);
  if (ore) {
    if (ore.spec.stratum !== undefined) return inStratum(ore.spec.stratum);
    const { minDepth, maxDepth } = ore.spec;
    return maxDepth >= WORLD_BOTTOM_DEPTH ? `from ${minDepth} m down` : `${minDepth}–${maxDepth} m down`;
  }
  if (item === 'stone') return 'under the dirt';
  if (item === 'wood') return profile.strata ? 'from trees and giant mushrooms' : 'from trees';
  if (profile.strata) {
    // A stratum's own rock (mudstone, deepstone, basalt).
    const s = STRATA.findIndex((stratum, i) => i > 0 && tileDef(stratum.rock).drop === item);
    if (s > 0) return inStratum(s);
  }
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

export function goalStatus(
  recipe: Recipe,
  inventory: Inventory,
  stations: ReadonlySet<Station>,
  chests: readonly Chest[],
  profile: GenProfile = CLASSIC_PROFILE,
): GoalStatus {
  return {
    recipe,
    ingredients: recipe.ingredients.map(({ item, count }) => ({
      item,
      need: count,
      have: availableCount(inventory, item, chests),
      where: whereFound(item, profile),
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

/**
 * The lowest-tier pickaxe recipe above `tier` (the best pickaxe carried) whose material can be
 * found in a world generated with `profile`, or null if there's none (worlds from before strata
 * have no emberite, so gold is their best).
 */
export function nextPickaxe(tier: number, profile: GenProfile = CLASSIC_PROFILE): PickaxeSuggestion | null {
  let best: PickaxeSuggestion | null = null;
  for (const recipe of RECIPES) {
    const t = itemDef(recipe.output).pickaxeTier;
    if (t === undefined || t <= tier || (best && t >= itemDef(best.recipe.output).pickaxeTier!)) continue;
    const material = recipe.ingredients[0].item;
    // A bar is smelted from the ore its recipe starts with.
    const ore = recipeFor(material)?.ingredients[0].item ?? null;
    if (whereFound(ore ?? material, profile) === null) continue;
    best = { recipe, material, ore };
  }
  return best;
}

/** The suggestion's note on where its material comes from: "Copper ore: 30–250 m down, smelted at a furnace". */
export function pickaxeNote(suggestion: PickaxeSuggestion, profile: GenProfile = CLASSIC_PROFILE): string {
  const raw = suggestion.ore ?? suggestion.material;
  const name = itemDef(raw).name;
  const smelt = recipeFor(suggestion.material);
  const station = smelt?.station ? `, smelted at a ${smelt.station}` : '';
  return `${name}: ${whereFound(raw, profile) ?? 'crafted'}${suggestion.ore ? station : ''}`;
}
