import {
  DEFAULT_MASTER_VOLUME,
  DEFAULT_SFX_VOLUME,
  DIG_TICK_FREQ,
  DIG_TICK_FREQ_PER_HARDNESS,
  PICKUP_FREQ,
  PICKUP_MAX_DELAY,
  PICKUP_RUN_STEPS,
  PICKUP_RUN_WINDOW,
  PICKUP_SPACING,
  SFX_MAX_VOICES,
  SFX_PAN,
  SFX_PITCH_JITTER,
  SFX_SAME_SOUND_GAP,
  SFX_VOLUMES,
} from '../config';
import type { TileMaterial } from '../world/tiles';

// Sound effects, synthesized with Web Audio as they play: filtered noise bursts and short
// oscillator blips, so there are no audio files (the same idea as the procedural textures).
// Browsers only let audio start after a user gesture, so the AudioContext is created on the
// first click or key press. Until then, and whenever a volume is 0, every sound is skipped.
// Sounds are cosmetic, so Math.random is fine here.

let ctx: AudioContext | null = null;
/** SFX volume; every sound plays into it. */
let sfxBus: GainNode | null = null;
let masterBus: GainNode | null = null;
/** One second of white noise, played from a random offset by every noise layer. */
let noise: AudioBuffer | null = null;
let masterVolume = DEFAULT_MASTER_VOLUME;
let sfxVolume = DEFAULT_SFX_VOLUME;
let voices = 0;
/** Context time each sound key last played, for SFX_SAME_SOUND_GAP. */
const lastPlayed = new Map<string, number>();
/** Pickup run: the scale step of the last blip and when it plays. */
let pickupStep = 0;
let pickupAt = -Infinity;

/** Listen for the first click or key press and start audio then. Call once at startup. */
export function initAudio(): void {
  // Listeners stay on: some browsers suspend audio again (e.g. after a phone call), and the
  // next gesture then resumes it.
  const unlock = (): void => {
    if (!ctx) createContext();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

function createContext(): void {
  try {
    ctx = new AudioContext();
  } catch {
    return; // no Web Audio: the game stays silent
  }
  // The compressor keeps a pile-up of sounds (a felled tree) from clipping.
  const compressor = ctx.createDynamicsCompressor();
  compressor.connect(ctx.destination);
  masterBus = ctx.createGain();
  masterBus.connect(compressor);
  sfxBus = ctx.createGain();
  sfxBus.connect(masterBus);
  masterBus.gain.value = gainFor(masterVolume);
  sfxBus.gain.value = gainFor(sfxVolume);

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

/** Volumes from the settings, 0..1 each. */
export function setVolumes(master: number, sfx: number): void {
  masterVolume = master;
  sfxVolume = sfx;
  if (!ctx || !masterBus || !sfxBus) return;
  // A short glide instead of a jump, so dragging a slider doesn't click.
  masterBus.gain.setTargetAtTime(gainFor(master), ctx.currentTime, 0.02);
  sfxBus.gain.setTargetAtTime(gainFor(sfx), ctx.currentTime, 0.02);
}

const gainFor = (volume: number): number => volume * volume;

/** For the F3 overlay. */
export function audioStatus(): string {
  return ctx ? `${ctx.state}, ${voices} playing` : 'starts on the first click';
}

// --- Building blocks ---

interface Voice {
  /** Context time the sound starts. */
  t: number;
  /** Every layer plays into this. */
  out: GainNode;
  /** The layer that ends last; when it does, the voice is done. */
  last: AudioScheduledSourceNode | null;
  end: number;
}

interface PlayOptions {
  volume: number;
  /** -1 (left) .. 1 (right), scaled down by SFX_PAN. */
  pan?: number;
  /** Seconds from now. */
  delay?: number;
  /** Skip it if a sound with this key played less than SFX_SAME_SOUND_GAP ago. */
  key?: string;
}

/** Play one sound made of the layers `build` adds, unless audio is off or too busy. */
function play(options: PlayOptions, build: (v: Voice) => void): void {
  if (!ctx || !sfxBus || !noise || ctx.state === 'closed') return;
  if (masterVolume <= 0 || sfxVolume <= 0 || voices >= SFX_MAX_VOICES) return;
  const now = ctx.currentTime;
  if (options.key) {
    if (now - (lastPlayed.get(options.key) ?? -Infinity) < SFX_SAME_SOUND_GAP) return;
    lastPlayed.set(options.key, now);
  }
  const out = ctx.createGain();
  out.gain.value = options.volume;
  const pan = Math.max(-1, Math.min(1, (options.pan ?? 0) * SFX_PAN));
  if (pan !== 0) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner).connect(sfxBus);
  } else {
    out.connect(sfxBus);
  }
  const v: Voice = { t: now + (options.delay ?? 0), out, last: null, end: 0 };
  build(v);
  voices++;
  const done = (): void => {
    voices--;
    out.disconnect();
  };
  if (v.last) v.last.onended = done;
  else done();
}

interface Layer {
  /** Seconds after the voice starts. */
  delay?: number;
  attack?: number;
  decay: number;
  gain: number;
}

interface ToneLayer extends Layer {
  type: OscillatorType;
  freq: number;
  /** Glide to this frequency over the decay. */
  to?: number;
}

interface NoiseLayer extends Layer {
  filter: BiquadFilterType;
  freq: number;
  /** Sweep the filter to this frequency over the decay. */
  to?: number;
  q?: number;
}

function tone(v: Voice, layer: ToneLayer): void {
  const c = ctx!;
  const t0 = v.t + (layer.delay ?? 0);
  const osc = c.createOscillator();
  osc.type = layer.type;
  osc.frequency.setValueAtTime(layer.freq, t0);
  if (layer.to) osc.frequency.exponentialRampToValueAtTime(layer.to, t0 + (layer.attack ?? 0) + layer.decay);
  osc.start(t0);
  envelope(v, osc, osc, t0, layer);
}

function noiseBurst(v: Voice, layer: NoiseLayer): void {
  const c = ctx!;
  const t0 = v.t + (layer.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = layer.filter;
  filter.Q.value = layer.q ?? 1;
  filter.frequency.setValueAtTime(layer.freq, t0);
  if (layer.to) filter.frequency.exponentialRampToValueAtTime(layer.to, t0 + (layer.attack ?? 0) + layer.decay);
  src.connect(filter);
  src.start(t0, Math.random() * 0.5);
  envelope(v, src, filter, t0, layer);
}

/** Fade `node` in over the attack and out over the decay into the voice, then stop its (started) `source`. */
function envelope(v: Voice, source: AudioScheduledSourceNode, node: AudioNode, t0: number, layer: Layer): void {
  const attack = layer.attack ?? 0.003;
  const end = t0 + attack + layer.decay;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(layer.gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  node.connect(g).connect(v.out);
  source.stop(end + 0.01);
  if (end >= v.end) {
    v.end = end;
    v.last = source;
  }
}

/** A random pitch factor near 1, so repeats don't sound identical. */
const jitter = (): number => 1 + (Math.random() * 2 - 1) * SFX_PITCH_JITTER;

// --- Materials ---

type Sound = (v: Voice, pitch: number) => void;

/** Breaking a tile: a thud for dirt, a crack for stone, a clink for ore. */
const BREAKS: Record<Exclude<TileMaterial, 'none'>, Sound> = {
  soil: (v, p) => {
    noiseBurst(v, { filter: 'lowpass', freq: 800 * p, to: 200 * p, q: 0.8, decay: 0.16, gain: 0.9 });
    tone(v, { type: 'sine', freq: 130 * p, to: 55 * p, decay: 0.14, gain: 0.7 });
  },
  grass: (v, p) => {
    BREAKS.soil(v, p);
    noiseBurst(v, { filter: 'highpass', freq: 3500 * p, decay: 0.08, gain: 0.25 });
  },
  stone: (v, p) => {
    noiseBurst(v, { filter: 'bandpass', freq: 2400 * p, to: 900 * p, q: 1.4, attack: 0.001, decay: 0.09, gain: 1 });
    noiseBurst(v, { filter: 'lowpass', freq: 1000 * p, to: 250 * p, decay: 0.2, gain: 0.6 });
    tone(v, { type: 'square', freq: 170 * p, to: 70 * p, attack: 0.001, decay: 0.05, gain: 0.1 });
  },
  ore: (v, p) => {
    noiseBurst(v, { filter: 'bandpass', freq: 2400 * p, to: 900 * p, q: 1.4, attack: 0.001, decay: 0.08, gain: 0.7 });
    noiseBurst(v, { filter: 'lowpass', freq: 1000 * p, to: 250 * p, decay: 0.16, gain: 0.4 });
    // Bell-like partials (inharmonic ratios) make the clink.
    const f = 1700 * p;
    tone(v, { type: 'sine', freq: f, delay: 0.01, decay: 0.35, gain: 0.3 });
    tone(v, { type: 'sine', freq: f * 2.76, delay: 0.01, decay: 0.22, gain: 0.14 });
    tone(v, { type: 'sine', freq: f * 5.4, delay: 0.01, decay: 0.12, gain: 0.07 });
  },
  wood: (v, p) => {
    noiseBurst(v, { filter: 'bandpass', freq: 850 * p, q: 3, attack: 0.001, decay: 0.09, gain: 0.9 });
    tone(v, { type: 'triangle', freq: 240 * p, to: 150 * p, decay: 0.13, gain: 0.6 });
  },
  plant: (v, p) => {
    noiseBurst(v, { filter: 'highpass', freq: 2600 * p, attack: 0.015, decay: 0.14, gain: 0.5 });
    noiseBurst(v, { filter: 'bandpass', freq: 1300 * p, delay: 0.05, attack: 0.01, decay: 0.1, gain: 0.3 });
  },
};

/** Footsteps, and the base of landing and placing sounds. */
const STEPS: Record<Exclude<TileMaterial, 'none'>, Sound> = {
  soil: (v, p) => noiseBurst(v, { filter: 'lowpass', freq: 550 * p, q: 0.8, decay: 0.06, gain: 1 }),
  grass: (v, p) => {
    STEPS.soil(v, p);
    noiseBurst(v, { filter: 'highpass', freq: 4000 * p, decay: 0.05, gain: 0.3 });
  },
  stone: (v, p) => {
    noiseBurst(v, { filter: 'bandpass', freq: 1900 * p, q: 2, attack: 0.001, decay: 0.035, gain: 0.9 });
    noiseBurst(v, { filter: 'lowpass', freq: 500 * p, decay: 0.05, gain: 0.5 });
  },
  ore: (v, p) => STEPS.stone(v, p),
  wood: (v, p) => {
    noiseBurst(v, { filter: 'bandpass', freq: 650 * p, q: 3, attack: 0.001, decay: 0.05, gain: 0.9 });
    tone(v, { type: 'triangle', freq: 190 * p, to: 150 * p, decay: 0.06, gain: 0.35 });
  },
  plant: (v, p) => noiseBurst(v, { filter: 'highpass', freq: 3000 * p, attack: 0.01, decay: 0.07, gain: 0.6 }),
};

// --- Sounds ---

/** One tick of digging at a tile: higher for harder tiles. `pan` is -1..1 across reach. */
export function dig(hardness: number, pan = 0): void {
  play({ volume: SFX_VOLUMES.dig, pan, key: 'dig' }, (v) => {
    const f = (DIG_TICK_FREQ + Math.min(hardness, 3) * DIG_TICK_FREQ_PER_HARDNESS) * jitter();
    noiseBurst(v, { filter: 'bandpass', freq: f * 2.5, q: 4, attack: 0.001, decay: 0.035, gain: 0.9 });
    tone(v, { type: 'triangle', freq: f, to: f * 0.75, attack: 0.001, decay: 0.045, gain: 0.5 });
  });
}

/** A tile broke. Harder tiles sound a little deeper and louder. */
export function breakTile(material: TileMaterial, hardness: number, pan = 0): void {
  if (material === 'none') return;
  const h = Math.min(hardness, 2.5);
  play({ volume: SFX_VOLUMES.break * (0.75 + h * 0.12), pan, key: `break:${material}` }, (v) =>
    BREAKS[material](v, (1.12 - h * 0.1) * jitter()),
  );
}

/** A block was placed. */
export function place(material: TileMaterial, pan = 0): void {
  if (material === 'none') return;
  play({ volume: SFX_VOLUMES.place, pan, key: 'place' }, (v) => {
    STEPS[material](v, 1.2 * jitter());
    tone(v, { type: 'sine', freq: 200, to: 120, attack: 0.002, decay: 0.07, gain: 0.5 });
  });
}

/** One footstep on a tile of this material. */
export function step(material: TileMaterial): void {
  if (material === 'none') return;
  play({ volume: SFX_VOLUMES.step, key: 'step' }, (v) => STEPS[material](v, jitter()));
}

export function jump(): void {
  play({ volume: SFX_VOLUMES.jump, key: 'jump' }, (v) => {
    const p = jitter();
    tone(v, { type: 'sine', freq: 240 * p, to: 480 * p, attack: 0.005, decay: 0.09, gain: 0.5 });
    noiseBurst(v, { filter: 'bandpass', freq: 900, to: 2000, q: 1.5, attack: 0.01, decay: 0.07, gain: 0.4 });
  });
}

/** Landing on a tile of this material; `strength` 0..1 grows with the fall speed. */
export function land(material: TileMaterial, strength: number): void {
  if (material === 'none') return;
  play({ volume: SFX_VOLUMES.land * (0.4 + 0.6 * strength), key: 'land' }, (v) => {
    STEPS[material](v, 0.8 * jitter());
    tone(v, { type: 'sine', freq: 110, to: 45, attack: 0.002, decay: 0.12 + 0.06 * strength, gain: 0.5 + 0.5 * strength });
  });
}

/**
 * Picking something up: a blip that climbs a pentatonic scale while pickups keep coming within
 * PICKUP_RUN_WINDOW of each other. Several at once play one after another.
 */
export function pickup(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  const at = Math.max(now, pickupAt + PICKUP_SPACING);
  if (at - now > PICKUP_MAX_DELAY) return;
  pickupStep = nextPickupStep(pickupStep, at - pickupAt);
  pickupAt = at;
  const f = PICKUP_FREQ * 2 ** (pickupSemitones(pickupStep) / 12);
  play({ volume: SFX_VOLUMES.pickup, delay: at - now }, (v) => {
    tone(v, { type: 'triangle', freq: f * 0.85, to: f, attack: 0.004, decay: 0.09, gain: 0.8 });
    tone(v, { type: 'sine', freq: f * 2, attack: 0.004, decay: 0.06, gain: 0.2 });
  });
}

/** Scale step of a pickup that comes `sinceLast` seconds after the previous one. */
export function nextPickupStep(step: number, sinceLast: number): number {
  return sinceLast <= PICKUP_RUN_WINDOW ? Math.min(step + 1, PICKUP_RUN_STEPS) : 0;
}

const PENTATONIC = [0, 2, 4, 7, 9];

/** Semitones above PICKUP_FREQ for a scale step: 0, 2, 4, 7, 9, 12, 14, ... */
export function pickupSemitones(step: number): number {
  return 12 * Math.floor(step / PENTATONIC.length) + PENTATONIC[step % PENTATONIC.length];
}

/** Crafted something: a hammer tap and a rising two-note chime. */
export function craft(): void {
  play({ volume: SFX_VOLUMES.craft, key: 'craft' }, (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 3000, q: 2, attack: 0.001, decay: 0.06, gain: 0.6 });
    tone(v, { type: 'triangle', freq: 659, delay: 0.02, decay: 0.15, gain: 0.5 });
    tone(v, { type: 'triangle', freq: 988, delay: 0.1, decay: 0.25, gain: 0.5 });
    tone(v, { type: 'sine', freq: 1976, delay: 0.1, decay: 0.2, gain: 0.12 });
  });
}

/** A door swung open (a creak) or shut (a creak and a knock as it meets the frame). */
export function door(open: boolean, pan = 0): void {
  play({ volume: SFX_VOLUMES.door, pan, key: 'door' }, (v) => {
    const p = jitter();
    noiseBurst(v, { filter: 'bandpass', freq: 700 * p, to: 1100 * p, q: 6, attack: 0.03, decay: 0.16, gain: 0.5 });
    tone(v, { type: 'sawtooth', freq: (open ? 180 : 230) * p, to: (open ? 260 : 170) * p, attack: 0.03, decay: 0.14, gain: 0.08 });
    if (open) return;
    noiseBurst(v, { filter: 'bandpass', freq: 600 * p, q: 3, delay: 0.14, attack: 0.001, decay: 0.06, gain: 1 });
    tone(v, { type: 'triangle', freq: 150 * p, to: 110 * p, delay: 0.14, decay: 0.08, gain: 0.45 });
  });
}

/** Gravel starting to shake: a low rumble with a patter of small stones. */
export function rumble(pan = 0): void {
  play({ volume: SFX_VOLUMES.rumble, pan, key: 'rumble' }, (v) => {
    const p = jitter();
    noiseBurst(v, { filter: 'lowpass', freq: 220 * p, to: 140 * p, attack: 0.04, decay: 0.38, gain: 1 });
    tone(v, { type: 'sawtooth', freq: 48 * p, to: 40 * p, attack: 0.05, decay: 0.32, gain: 0.12 });
    for (let i = 0; i < 4; i++) {
      noiseBurst(v, { filter: 'bandpass', freq: 2400 * p, q: 5, delay: 0.06 + i * 0.08, attack: 0.001, decay: 0.025, gain: 0.35 });
    }
  });
}

/** A falling block of gravel landed (or burst): a crunchy thud. */
export function gravelLand(pan = 0): void {
  play({ volume: SFX_VOLUMES.gravelLand, pan, key: 'gravelLand' }, (v) => {
    const p = jitter();
    noiseBurst(v, { filter: 'bandpass', freq: 900 * p, to: 500 * p, q: 1.2, attack: 0.002, decay: 0.12, gain: 1 });
    tone(v, { type: 'sine', freq: 95 * p, to: 50 * p, attack: 0.002, decay: 0.12, gain: 0.6 });
  });
}

/** The player took damage: a dull thump with a short falling grunt. */
export function hurt(): void {
  play({ volume: SFX_VOLUMES.hurt, key: 'hurt' }, (v) => {
    const p = jitter();
    tone(v, { type: 'sine', freq: 140 * p, to: 50 * p, attack: 0.002, decay: 0.18, gain: 0.9 });
    tone(v, { type: 'square', freq: 330 * p, to: 180 * p, attack: 0.01, decay: 0.12, gain: 0.12 });
    noiseBurst(v, { filter: 'lowpass', freq: 900, to: 200, decay: 0.12, gain: 0.5 });
  });
}

/** The player died: three falling notes. */
export function death(): void {
  play({ volume: SFX_VOLUMES.death, key: 'death' }, (v) => {
    [392, 330, 247].forEach((f, i) => tone(v, { type: 'triangle', freq: f, delay: i * 0.18, attack: 0.01, decay: 0.3, gain: 0.6 }));
    tone(v, { type: 'sine', freq: 98, delay: 0.36, attack: 0.02, decay: 0.6, gain: 0.5 });
  });
}

/** The bed became the respawn point: a soft rising chime. */
export function bedSet(): void {
  play({ volume: SFX_VOLUMES.bed, key: 'bed' }, (v) => {
    tone(v, { type: 'sine', freq: 523, attack: 0.02, decay: 0.3, gain: 0.5 });
    tone(v, { type: 'sine', freq: 784, delay: 0.12, attack: 0.02, decay: 0.4, gain: 0.5 });
  });
}

/** A menu button or an inventory slot was clicked. */
export function uiClick(): void {
  play({ volume: SFX_VOLUMES.ui, key: 'ui' }, (v) => {
    tone(v, { type: 'triangle', freq: 1500, to: 1000, attack: 0.001, decay: 0.03, gain: 0.6 });
    noiseBurst(v, { filter: 'highpass', freq: 5000, attack: 0.001, decay: 0.015, gain: 0.3 });
  });
}
