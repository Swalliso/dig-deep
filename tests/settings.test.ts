import { describe, expect, it } from 'vitest';
import { storageKey } from '../src/channel';
import { DEFAULT_MASTER_VOLUME, DEFAULT_SFX_VOLUME } from '../src/config';
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
      screenShake: true,
      pixelScale: 'auto',
      showFps: false,
      showMinimap: true,
    });
    expect(parseSettings(null)).toEqual(defaults);
    expect(parseSettings('not json')).toEqual(defaults);
    expect(parseSettings('42')).toEqual(defaults);
  });

  it('round-trip through JSON', () => {
    const settings = { masterVolume: 0, sfxVolume: 0.35, screenShake: false, pixelScale: 3 as const, showFps: true, showMinimap: false };
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
  });

  it('fill in missing or invalid fields with defaults and clamp volumes', () => {
    const parsed = parseSettings(JSON.stringify({ masterVolume: 7, sfxVolume: 'loud', pixelScale: 4, showFps: true }));
    expect(parsed).toEqual({ ...defaultSettings(), masterVolume: 1, showFps: true });
    expect(parseSettings(JSON.stringify({ masterVolume: -1 })).masterVolume).toBe(0);
  });
});
