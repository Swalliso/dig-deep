import { checkSave, findSaveProblem, SAVE_VERSION, type SaveData } from './save';

// World backups: a save exported to a JSON file, and read back in with checks before it may
// replace anything. The save goes in whole, so whatever identifies how its world was generated
// (the seed, SAVE_VERSION and the generation profile) travels with it. JSON has no
// binary type, so Uint8Arrays (chunk and map data) are written as { "$bytes": "<base64>" }.

/** What a backup file holds. */
interface BackupFile {
  game: 'dig-deep';
  kind: 'world';
  /** Bump if the file layout around the save changes. */
  backupVersion: number;
  /** Date.now() when exported. */
  exportedAt: number;
  save: SaveData;
}

const BACKUP_VERSION = 1;
/** Longest world name kept from a backup (the New world screen allows 40 characters). */
const MAX_NAME = 40;

export type BackupRead = { kind: 'ok'; save: SaveData } | { kind: 'invalid'; reason: string };

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // In slices, so String.fromCharCode never gets too many arguments.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Throws if `text` isn't base64. */
export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The backup file's text for a save. */
export function backupText(save: SaveData): string {
  const file: BackupFile = { game: 'dig-deep', kind: 'world', backupVersion: BACKUP_VERSION, exportedAt: Date.now(), save };
  return JSON.stringify(file, (_key, value: unknown) => (value instanceof Uint8Array ? { $bytes: bytesToBase64(value) } : value));
}

/**
 * Read a backup file's text: the save inside, ready to store, or why it can't be imported (not
 * a backup, from another version of the game, or damaged).
 */
export function readBackup(text: string): BackupRead {
  let file: Partial<BackupFile>;
  try {
    file = JSON.parse(text, (_key, value: unknown) => {
      const bytes = (value as { $bytes?: unknown } | null)?.$bytes;
      return typeof bytes === 'string' && Object.keys(value as object).length === 1 ? base64ToBytes(bytes) : value;
    });
  } catch {
    return { kind: 'invalid', reason: "That file isn't a Dig Deep world backup." };
  }
  if (!file || file.game !== 'dig-deep' || file.kind !== 'world' || typeof file.save !== 'object') {
    return { kind: 'invalid', reason: "That file isn't a Dig Deep world backup." };
  }
  if (file.backupVersion !== BACKUP_VERSION) {
    return { kind: 'invalid', reason: "That backup was made by another version of Dig Deep, so it can't be imported." };
  }
  const status = checkSave(file.save);
  if (status.kind === 'outdated') {
    const which = status.version < SAVE_VERSION ? 'an older' : 'a newer';
    return { kind: 'invalid', reason: `That world was saved by ${which} version of Dig Deep, so it can't be imported.` };
  }
  if (status.kind !== 'ok') return { kind: 'invalid', reason: "That backup is damaged, so it can't be imported." };
  const problem = findSaveProblem(status.save);
  if (problem) return { kind: 'invalid', reason: `That backup is damaged (${problem}), so it can't be imported.` };
  const save = status.save;
  const name = typeof save.name === 'string' ? save.name.trim().slice(0, MAX_NAME) : '';
  return { kind: 'ok', save: { ...save, name: name || undefined } };
}

/** 'dig-deep-my-world-2026-10-16.json' */
export function backupFileName(worldName: string, date = new Date()): string {
  const slug = worldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `dig-deep-${slug || 'world'}-${day}.json`;
}
