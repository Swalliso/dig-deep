// The controls list: shown on the Controls screen and mirrored in README.md's controls table
// (a test keeps the two in step and checks every row fits the screen).

/** Longest row (action + input, in characters) that fits one line of the Controls screen. */
export const CONTROLS_ROW_MAX_CHARS = 52;

/** [action, input] pairs, in the order they're listed. */
export const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['Move', 'A / D or ← / →'],
  ['Jump', 'Space, W or ↑'],
  ['Dig', 'Hold left mouse on a tile'],
  ['Place the held block', 'Left mouse on empty space'],
  ['Build a row', 'Hold left mouse and sweep'],
  ['Pick block onto hotbar', 'Middle mouse'],
  ['Open chest, open or close door', 'Right-click it'],
  ['Climb a ladder', 'W / S or ↑ / ↓ on it'],
  ['Drop through a platform', 'S + Space'],
  ['Map / minimap', 'M / N'],
  ['Select hotbar slot', '1–0 or mouse wheel'],
  ['Drop selected stack', 'Q'],
  ['Quick stack to nearby chests', 'C'],
  ['Inventory, crafting, nearest chest', 'E or Tab'],
  ['Move stack (hotbar ↔ bag ↔ chest)', 'Shift-click'],
  ['Craft 10', 'Shift-click a recipe'],
  ['Pause', 'Esc'],
  ['Debug overlay (FPS)', 'F3'],
];
