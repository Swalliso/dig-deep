import { describe, expect, it } from 'vitest';
import { storageKey } from '../src/channel';
import { DEFAULT_AMBIENCE_VOLUME, DEFAULT_MASTER_VOLUME, DEFAULT_SFX_VOLUME } from '../src/config';
import { defaultSettings, parseSettings, SETTINGS_KEY } from '../src/systems/settings';

describe('settings', () => {
  it('are stored under a channel key, separate from the save', () => {
    expect(SETTINGS_KEY).toBe(storageKey('settings'));
    expect(storageKey('settings', 'live')).toBe('dig-deep:settings');
    expect(storageKey('settings', 'dev')).toBe('dig-deep-dev:settings');
  });

  it('default when nothing is stored or it is unreadable', () => {
    const defaults = defaultSettings();
    expect(defaults).toEqual({
      masterVolume: DEFAULT_MASTER_VOLUME,
      sfxVolume: DEFAULT_SFX_VOLUME,
      ambienceVolume: DEFAULT_AMBIENCE_VOLUME,
      screenShake: true,
      reducedFlashes: false,
      pixelScale: 'auto',
      showFps: false,
      showMinimap: true,
      smartCursor: false,
    });
    expect(parseSettings(null)).toEqual(defaults);
    expect(parseSettings('not json')).toEqual(defaults);
    expect(parseSettings('42')).toEqual(defaults);
  });

  it('round-trip through JSON', () => {
    const settings = { masterVolume: 0, sfxVolume: 0.35, ambienceVolume: 0.2, screenShake: false, reducedFlashes: true, pixelScale: 3 as const, showFps: true, showMinimap: false, smartCursor: true };
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
  });

  it('keep the smart cursor off unless it was switched on', () => {
    // Settings saved before the smart cursor existed get it off.
    expect(parseSettings(JSON.stringify({ masterVolume: 0.5 })).smartCursor).toBe(false);
    expect(parseSettings(JSON.stringify({ smartCursor: 'yes' })).smartCursor).toBe(false);
    expect(parseSettings(JSON.stringify({ smartCursor: true })).smartCursor).toBe(true);
  });

  it('fill in missing or invalid fields with defaults and clamp volumes', () => {
    const parsed = parseSettings(JSON.stringify({ masterVolume: 7, sfxVolume: 'loud', pixelScale: 4, showFps: true }));
    expect(parsed).toEqual({ ...defaultSettings(), masterVolume: 1, showFps: true });
    expect(parseSettings(JSON.stringify({ masterVolume: -1 })).masterVolume).toBe(0);
    // Settings saved before the ambience slider existed get its default.
    expect(parseSettings(JSON.stringify({ masterVolume: 0.5 })).ambienceVolume).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(parseSettings(JSON.stringify({ ambienceVolume: 3 })).ambienceVolume).toBe(1);
  });
});
