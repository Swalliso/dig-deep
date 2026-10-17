import { STATION_NAMES } from '../systems/crafting';
import type { GoalStatus } from '../systems/goal';
import { itemDef } from '../systems/items';

// The pinned recipe on the HUD, as lines for drawHudLine (ui/vitals.ts): what it is and where
// it's crafted, then each ingredient with how many there are (carried plus nearby chests), and
// where to find the raw materials still missing.

const TITLE = '#ffe066';
const READY = '#a8f0b0';
const HAVE = '#cfe8c8';
const SHORT = '#ffb0a0';

/** [text, color] lines: "Goal: Copper Pickaxe @ Workbench", "  Copper Bar 3/10", ... */
export function goalHudLines(status: GoalStatus): [string, string][] {
  const { recipe } = status;
  const name = itemDef(recipe.output).name;
  if (status.ready) return [[`Goal: ${name}, ready to craft`, READY]];
  const where = recipe.station ? ` @ ${STATION_NAMES[recipe.station]}${status.stationNear ? '' : ' (none near)'}` : ' (by hand)';
  const lines: [string, string][] = [[`Goal: ${name}${where}`, TITLE]];
  for (const { item, need, have, where: found } of status.ingredients) {
    const short = have < need;
    const hint = short && found ? `, ${found}` : '';
    lines.push([`  ${itemDef(item).name} ${Math.min(have, need)}/${need}${hint}`, short ? SHORT : HAVE]);
  }
  return lines;
}
