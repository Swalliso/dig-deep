import { storageKey } from '../channel';

// One-time hints: which ones this player has already been through, kept per device in
// localStorage (like the settings), so a hint that teaches something shows until it's learned.

export type HintId = 'placeBeam' | 'placeSpan';

const HINTS_KEY = storageKey('hints');

/** Hints seen, read once; also the fallback when storage is blocked. */
let seen: Set<string> | null = null;

function load(): Set<string> {
  if (seen) return seen;
  seen = new Set();
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(HINTS_KEY) ?? '[]');
    if (Array.isArray(stored)) for (const id of stored) if (typeof id === 'string') seen.add(id);
  } catch {
    // unreadable or blocked: nothing seen yet
  }
  return seen;
}

export function hintSeen(id: HintId): boolean {
  return load().has(id);
}

export function markHintSeen(id: HintId): void {
  const hints = load();
  if (hints.has(id)) return;
  hints.add(id);
  try {
    localStorage.setItem(HINTS_KEY, JSON.stringify([...hints]));
  } catch {
    // Storage blocked or full: remembered until the page closes.
  }
}
