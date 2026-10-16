import { storageKey } from '../channel';
import { DEFAULT_MASTER_VOLUME, DEFAULT_SFX_VOLUME } from '../config';

// Player preferences, kept per device in localStorage (separately for the live and dev sites).

/** Device pixels per world pixel: 'auto' picks 2 or 3 by window height. */
export type PixelScale = 'auto' | 2 | 3;

export interface Settings {
  /** 0..1 */
  masterVolume: number;
  /** 0..1 */
  sfxVolume: number;
  screenShake: boolean;
  pixelScale: PixelScale;
  /** Small FPS counter in the corner (F3 shows it too). */
  showFps: boolean;
}

export const SETTINGS_KEY = storageKey('settings');

export function defaultSettings(): Settings {
  return {
    masterVolume: DEFAULT_MASTER_VOLUME,
    sfxVolume: DEFAULT_SFX_VOLUME,
    screenShake: true,
    pixelScale: 'auto',
    showFps: false,
  };
}

/** Settings from stored JSON. Anything missing or invalid gets its default. */
export function parseSettings(json: string | null): Settings {
  const settings = defaultSettings();
  let stored: unknown = null;
  try {
    stored = json ? JSON.parse(json) : null;
  } catch {
    // unreadable: defaults
  }
  if (!stored || typeof stored !== 'object') return settings;
  const s = stored as Record<string, unknown>;
  const volume = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
  settings.masterVolume = volume(s.masterVolume, settings.masterVolume);
  settings.sfxVolume = volume(s.sfxVolume, settings.sfxVolume);
  if (typeof s.screenShake === 'boolean') settings.screenShake = s.screenShake;
  if (s.pixelScale === 'auto' || s.pixelScale === 2 || s.pixelScale === 3) settings.pixelScale = s.pixelScale;
  if (typeof s.showFps === 'boolean') settings.showFps = s.showFps;
  return settings;
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return defaultSettings(); // storage blocked
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked or full: the settings still apply until the page closes.
  }
}
