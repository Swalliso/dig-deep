import {
  AMBIENCE_FADE,
  AMBIENCE_MAX_VOICES,
  AMBIENCE_TRIM,
  AMBIENCE_VOLUMES,
  DEFAULT_AMBIENCE_VOLUME,
  DEFAULT_MASTER_VOLUME,
  DEFAULT_SFX_VOLUME,
  DIG_TICK_FREQ,
  DIG_TICK_FREQ_PER_HARDNESS,
  LIMITER_KNEE,
  LIMITER_RATIO,
  MASTER_LIMIT_ATTACK,
  MASTER_LIMIT_RELEASE,
  MASTER_LIMIT_THRESHOLD,
  PICKUP_FREQ,
  PICKUP_MAX_DELAY,
  PICKUP_RUN_STEPS,
  PICKUP_RUN_WINDOW,
  PICKUP_SPACING,
  SFX_LIMIT_ATTACK,
  SFX_LIMIT_RELEASE,
  SFX_LIMIT_THRESHOLD,
  SFX_MAX_VOICES,
  SFX_PAN,
  SFX_PITCH_JITTER,
  SFX_SAME_SOUND_GAP,
  SFX_VOLUMES,
  type AmbienceId,
} from '../config';
import type { TileMaterial } from '../world/tiles';

// Sound effects, synthesized with Web Audio as they play: filtered noise bursts and short
// oscillator blips, so there are no audio files (the same idea as the procedural textures).
// Browsers only let audio start after a user gesture, so the AudioContext is created on the
// first click or key press. Until then, and whenever a volume is 0, every sound is skipped.
// Sounds are cosmetic, so Math.random is fine here.
//
// Strata worlds also have ambience (Phase 14a): a quiet bed of sound per stratum that loops for
// as long as the player is in it, plus events played now and then on top. It has its own bus
// and volume setting, under the master volume.
//
// Mixing: effects → SFX volume → effects limiter → master volume → master limiter → speakers, and
// ambience → ambience volume → master volume, so a burst of effects never pushes the ambience
// down. The limiters are there for pile-ups and loud settings; at normal levels neither engages.

let ctx: AudioContext | null = null;
/** SFX volume; every sound plays into it. */
let sfxBus: GainNode | null = null;
/** Ambience volume; the stratum beds and ambient events play into it. */
let ambienceBus: GainNode | null = null;
let masterBus: GainNode | null = null;
/** One second of white noise, looped from a random offset by every noise layer. */
let noise: AudioBuffer | null = null;
/** Four seconds of brown (deep) noise, looped under the ambience beds. */
let brownNoise: AudioBuffer | null = null;
let masterVolume = DEFAULT_MASTER_VOLUME;
let sfxVolume = DEFAULT_SFX_VOLUME;
let ambienceVolume = DEFAULT_AMBIENCE_VOLUME;
/** Effects playing now (up to SFX_MAX_VOICES), and ambient events (up to AMBIENCE_MAX_VOICES). */
let voices = 0;
let ambientVoices = 0;
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
  // The effects' limiter holds a pile-up of sounds (a felled tree) down; the ambience skips it.
  // The master limiter only catches what would still clip.
  const masterLimiter = limiter(ctx, MASTER_LIMIT_THRESHOLD, MASTER_LIMIT_ATTACK, MASTER_LIMIT_RELEASE);
  masterLimiter.connect(ctx.destination);
  masterBus = ctx.createGain();
  masterBus.connect(masterLimiter);
  const sfxLimiter = limiter(ctx, SFX_LIMIT_THRESHOLD, SFX_LIMIT_ATTACK, SFX_LIMIT_RELEASE);
  sfxLimiter.connect(masterBus);
  sfxBus = ctx.createGain();
  sfxBus.connect(sfxLimiter);
  ambienceBus = ctx.createGain();
  ambienceBus.connect(masterBus);
  masterBus.gain.value = gainFor(masterVolume);
  sfxBus.gain.value = gainFor(sfxVolume);
  ambienceBus.gain.value = gainFor(ambienceVolume) * AMBIENCE_TRIM;

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  // Brown noise: white noise summed up (with a slow leak back to zero), so it rumbles.
  brownNoise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const brown = brownNoise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < brown.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    brown[i] = last * 3.5;
  }
}

/** A compressor set up as a limiter: it leaves sounds alone up to `threshold` dBFS. */
function limiter(c: AudioContext, threshold: number, attack: number, release: number): DynamicsCompressorNode {
  const node = c.createDynamicsCompressor();
  node.threshold.value = threshold;
  node.knee.value = LIMITER_KNEE;
  node.ratio.value = LIMITER_RATIO;
  node.attack.value = attack;
  node.release.value = release;
  return node;
}

/** Volumes from the settings, 0..1 each. */
export function setVolumes(master: number, sfx: number, ambience = ambienceVolume): void {
  masterVolume = master;
  sfxVolume = sfx;
  ambienceVolume = ambience;
  if (!ctx || !masterBus || !sfxBus || !ambienceBus) return;
  // A short glide instead of a jump, so dragging a slider doesn't click.
  masterBus.gain.setTargetAtTime(gainFor(master), ctx.currentTime, 0.02);
  sfxBus.gain.setTargetAtTime(gainFor(sfx), ctx.currentTime, 0.02);
  ambienceBus.gain.setTargetAtTime(gainFor(ambience) * AMBIENCE_TRIM, ctx.currentTime, 0.02);
}

const gainFor = (volume: number): number => volume * volume;

/** For the F3 overlay. */
export function audioStatus(): string {
  return ctx ? `${ctx.state}, ${voices} playing (+${ambientVoices} ambient), ambience ${bed?.id ?? 'none'}` : 'starts on the first click';
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
  /** Ambient events play into the ambience bus instead of the SFX bus, with their own voice budget. */
  ambience?: boolean;
}

/** Play one sound made of the layers `build` adds, unless audio is off or too busy. */
function play(options: PlayOptions, build: (v: Voice) => void): void {
  const ambient = options.ambience === true;
  const bus = ambient ? ambienceBus : sfxBus;
  if (!ctx || !bus || !noise || ctx.state === 'closed') return;
  if (masterVolume <= 0 || (ambient ? ambienceVolume : sfxVolume) <= 0) return;
  if (ambient ? ambientVoices >= AMBIENCE_MAX_VOICES : voices >= SFX_MAX_VOICES) return;
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
    out.connect(panner).connect(bus);
  } else {
    out.connect(bus);
  }
  const v: Voice = { t: now + (options.delay ?? 0), out, last: null, end: 0 };
  build(v);
  if (ambient) ambientVoices++;
  else voices++;
  const done = (): void => {
    if (ambient) ambientVoices--;
    else voices--;
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
  // Looped, so a layer longer than what's left of the buffer after its random start doesn't stop
  // dead partway (a click, and the voice's other layers cut off with it).
  src.loop = true;
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
/** One heartbeat (lub-dub) while dread is full. `strength` 0..1. */
export function heartbeat(strength = 1): void {
  play({ volume: SFX_VOLUMES.heartbeat * strength, key: 'heartbeat' }, (v) => {
    tone(v, { type: 'sine', freq: 62, to: 44, attack: 0.01, decay: 0.16, gain: 1 });
    noiseBurst(v, { filter: 'lowpass', freq: 160, attack: 0.005, decay: 0.08, gain: 0.5 });
    tone(v, { type: 'sine', freq: 54, to: 40, delay: 0.2, attack: 0.01, decay: 0.14, gain: 0.7 });
  });
}

/** Heat burns, or lava touched: a hiss with a crackle in it. */
export function sizzle(): void {
  play({ volume: SFX_VOLUMES.sizzle, key: 'sizzle' }, (v) => {
    const p = jitter();
    noiseBurst(v, { filter: 'highpass', freq: 2500 * p, to: 4500 * p, attack: 0.01, decay: 0.35, gain: 0.6 });
    noiseBurst(v, { filter: 'bandpass', freq: 900 * p, q: 3, delay: 0.05, attack: 0.002, decay: 0.05, gain: 0.5 });
    noiseBurst(v, { filter: 'bandpass', freq: 1300 * p, q: 3, delay: 0.14, attack: 0.002, decay: 0.04, gain: 0.4 });
  });
}

/** The Heart of the Deep claimed: a low swell under a rising major arpeggio that rings out. */
export function heartClaimed(): void {
  play({ volume: SFX_VOLUMES.heart, key: 'heart' }, (v) => {
    tone(v, { type: 'sine', freq: 65, attack: 0.4, decay: 2.6, gain: 0.7 });
    [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(v, { type: 'triangle', freq: f, delay: 0.15 + i * 0.14, attack: 0.02, decay: 1.6 - i * 0.12, gain: 0.45 }));
    tone(v, { type: 'sine', freq: 1047, delay: 1.0, attack: 0.05, decay: 1.8, gain: 0.25 });
  });
}

/** A flare thrown: a whoosh, then it catches with a fizz. */
export function flareThrow(): void {
  play({ volume: SFX_VOLUMES.flare, key: 'flare' }, (v) => {
    const p = jitter();
    noiseBurst(v, { filter: 'bandpass', freq: 900 * p, to: 2200 * p, q: 1.5, attack: 0.02, decay: 0.16, gain: 0.6 });
    noiseBurst(v, { filter: 'highpass', freq: 3500 * p, delay: 0.1, attack: 0.01, decay: 0.45, gain: 0.45 });
  });
}

export function bedSet(): void {
  play({ volume: SFX_VOLUMES.bed, key: 'bed' }, (v) => {
    tone(v, { type: 'sine', freq: 523, attack: 0.02, decay: 0.3, gain: 0.5 });
    tone(v, { type: 'sine', freq: 784, delay: 0.12, attack: 0.02, decay: 0.4, gain: 0.5 });
  });
}

/** A lift cage sets off (Phase 15): a clunk as the brake lets go, then the motor winding up. */
export function liftStart(pan = 0): void {
  play({ volume: SFX_VOLUMES.lift, pan, key: 'liftStart' }, (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 500, q: 4, attack: 0.002, decay: 0.08, gain: 0.9 });
    tone(v, { type: 'triangle', freq: 120, to: 90, attack: 0.002, decay: 0.1, gain: 0.5 });
    tone(v, { type: 'sawtooth', freq: 70, to: 140, delay: 0.05, attack: 0.15, decay: 0.6, gain: 0.07 });
  });
}

/** The cage clacking over a rail joint while it rides. */
export function liftRattle(pan = 0): void {
  play({ volume: SFX_VOLUMES.lift * 0.5, pan, key: 'liftRattle' }, (v) => {
    const p = jitter();
    noiseBurst(v, { filter: 'bandpass', freq: 2200 * p, q: 5, attack: 0.001, decay: 0.03, gain: 0.6 });
    tone(v, { type: 'square', freq: 340 * p, attack: 0.001, decay: 0.025, gain: 0.08 });
  });
}

/** A lift cage pulls in level with a stop: the brake, then a two-note bell. */
export function liftArrive(pan = 0): void {
  play({ volume: SFX_VOLUMES.lift, pan, key: 'liftArrive' }, (v) => {
    noiseBurst(v, { filter: 'lowpass', freq: 900, attack: 0.002, decay: 0.12, gain: 0.7 });
    tone(v, { type: 'sine', freq: 988, delay: 0.08, attack: 0.005, decay: 0.5, gain: 0.35 });
    tone(v, { type: 'sine', freq: 784, delay: 0.26, attack: 0.005, decay: 0.7, gain: 0.35 });
  });
}

/** A lift stop's call button: a click and a short rising chime. */
export function liftCall(): void {
  play({ volume: SFX_VOLUMES.lift, key: 'liftCall' }, (v) => {
    noiseBurst(v, { filter: 'highpass', freq: 3000, attack: 0.001, decay: 0.02, gain: 0.5 });
    tone(v, { type: 'triangle', freq: 660, to: 880, delay: 0.03, attack: 0.005, decay: 0.18, gain: 0.35 });
  });
}

/** The drill biting into rock (Phase 16): a buzzing whir, higher on harder tiles. */
export function drill(hardness: number, pan = 0): void {
  play({ volume: SFX_VOLUMES.dig, pan, key: 'drill' }, (v) => {
    const f = (DIG_TICK_FREQ + Math.min(hardness, 3) * DIG_TICK_FREQ_PER_HARDNESS) * jitter();
    tone(v, { type: 'sawtooth', freq: f * 0.6, to: f * 0.66, attack: 0.005, decay: 0.07, gain: 0.25 });
    noiseBurst(v, { filter: 'bandpass', freq: f * 3, q: 6, attack: 0.002, decay: 0.06, gain: 0.7 });
  });
}

/** A bomb thrown: a whoosh, with the fuse fizzing. */
export function bombThrow(): void {
  play({ volume: SFX_VOLUMES.bomb * 0.6, key: 'bombThrow' }, (v) => {
    const p = jitter();
    noiseBurst(v, { filter: 'bandpass', freq: 700 * p, to: 1600 * p, q: 1.5, attack: 0.02, decay: 0.14, gain: 0.6 });
    noiseBurst(v, { filter: 'highpass', freq: 5000 * p, delay: 0.05, attack: 0.01, decay: 0.6, gain: 0.25 });
  });
}

/** A bomb going off: a sharp crack, a deep boom and rubble rattling down. */
export function explosion(pan = 0): void {
  play({ volume: SFX_VOLUMES.bomb, pan, key: 'explosion' }, (v) => {
    const p = jitter();
    noiseBurst(v, { filter: 'highpass', freq: 1800 * p, attack: 0.001, decay: 0.06, gain: 0.8 });
    noiseBurst(v, { filter: 'lowpass', freq: 400 * p, to: 90 * p, attack: 0.005, decay: 0.9, gain: 1 });
    tone(v, { type: 'sine', freq: 70 * p, to: 34 * p, attack: 0.005, decay: 0.7, gain: 0.8 });
    for (let i = 0; i < 5; i++) {
      noiseBurst(v, { filter: 'bandpass', freq: 1600 * p, q: 4, delay: 0.25 + i * 0.09, attack: 0.001, decay: 0.03, gain: 0.3 });
    }
  });
}

/** A rope ladder unrolling down a shaft: a run of soft slaps. */
export function rope(pan = 0): void {
  play({ volume: SFX_VOLUMES.place, pan, key: 'rope' }, (v) => {
    const p = jitter();
    for (let i = 0; i < 6; i++) {
      noiseBurst(v, { filter: 'bandpass', freq: 900 * p - i * 60, q: 2, delay: i * 0.06, attack: 0.002, decay: 0.05, gain: 0.6 - i * 0.07 });
    }
  });
}

/** An accessory put on or taken off: a buckle's click. */
export function equip(): void {
  play({ volume: SFX_VOLUMES.ui, key: 'equip' }, (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 3000, q: 3, attack: 0.001, decay: 0.03, gain: 0.7 });
    tone(v, { type: 'triangle', freq: 880, to: 1320, delay: 0.03, attack: 0.002, decay: 0.08, gain: 0.35 });
  });
}

/** A menu button or an inventory slot was clicked. */
export function uiClick(): void {
  play({ volume: SFX_VOLUMES.ui, key: 'ui' }, (v) => {
    tone(v, { type: 'triangle', freq: 1500, to: 1000, attack: 0.001, decay: 0.03, gain: 0.6 });
    noiseBurst(v, { filter: 'highpass', freq: 5000, attack: 0.001, decay: 0.015, gain: 0.3 });
  });
}

// --- Ambience (strata worlds) ---

/** A stratum's bed of sound, looping until it fades out. */
interface Bed {
  id: AmbienceId;
  /** Everything in the bed plays into this; its gain fades the bed in and out. */
  out: GainNode;
  sources: AudioScheduledSourceNode[];
}

let bed: Bed | null = null;
/** The level the bed is fading to (0..1, before AMBIENCE_VOLUMES and the settings). */
let bedLevel = 0;

/**
 * Play stratum ambience `id` at `level` (0..1; the inventory or map ducks it), or none (null).
 * Call every step: it only does something when either changes. A new stratum's bed fades in over
 * AMBIENCE_FADE while the old one fades out; null fades it out (the pause menu, the title screen).
 */
export function setAmbience(id: AmbienceId | null, level: number): void {
  if (!ctx || !ambienceBus || !brownNoise || ctx.state === 'closed') return;
  const now = ctx.currentTime;
  if (bed && (bed.id !== id || level <= 0)) {
    fadeOut(bed, now);
    bed = null;
  }
  if (!id || level <= 0) return;
  const fresh = !bed;
  if (!bed) bed = buildBed(id, now);
  if (fresh || level !== bedLevel) {
    const gain = bed.out.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(level * AMBIENCE_VOLUMES[id], now + (fresh ? AMBIENCE_FADE : 0.4));
    bedLevel = level;
  }
}

function fadeOut(b: Bed, now: number): void {
  const gain = b.out.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(0, now + AMBIENCE_FADE);
  for (const source of b.sources) source.stop(now + AMBIENCE_FADE + 0.05);
  b.sources[0].onended = () => b.out.disconnect();
}

/**
 * Build a stratum's bed, silent until setAmbience fades it in: wind for Topsoil, a low drone for
 * the Stone Caverns, damp air for the Fungal Hollows, a crystal hum for the Geode Depths and a
 * deep rumble for the Magma Layer. Slow LFOs keep each one moving.
 */
function buildBed(id: AmbienceId, t: number): Bed {
  const c = ctx!;
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(ambienceBus!);
  const sources: AudioScheduledSourceNode[] = [];
  const osc = (type: OscillatorType, freq: number, gain: number): GainNode => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    o.connect(g).connect(out);
    o.start(t);
    sources.push(o);
    return g;
  };
  /** Looped brown noise through a filter; returns the filter and the gain after it. */
  const rumble = (type: BiquadFilterType, freq: number, q: number, gain: number): { filter: BiquadFilterNode; level: GainNode } => {
    const s = c.createBufferSource();
    s.buffer = brownNoise;
    s.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const level = c.createGain();
    level.gain.value = gain;
    s.connect(filter).connect(level).connect(out);
    s.start(t, Math.random() * 3);
    sources.push(s);
    return { filter, level };
  };
  /** A slow wobble of `depth` around a parameter's value. */
  const lfo = (freq: number, depth: number, param: AudioParam): void => {
    const o = c.createOscillator();
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start(t);
    sources.push(o);
  };
  if (id === 'wind') {
    const wind = rumble('bandpass', 420, 0.6, 1.4);
    lfo(0.07, 220, wind.filter.frequency); // its pitch wanders
    lfo(0.11, 0.6, wind.level.gain); // and it gusts
  } else if (id === 'drone') {
    osc('sine', 55, 0.35);
    osc('sine', 82.4, 0.2);
    osc('sine', 110.6, 0.06); // beats slowly against 2 x 55
    const air = rumble('lowpass', 170, 0.7, 0.9);
    lfo(0.05, 0.35, air.level.gain);
  } else if (id === 'drips') {
    const damp = rumble('bandpass', 650, 0.9, 0.9);
    lfo(0.09, 0.35, damp.level.gain);
    osc('sine', 98, 0.08);
  } else if (id === 'hum') {
    osc('sine', 523.3, 0.07);
    osc('sine', 524.9, 0.07); // a slow shimmer against the note above
    osc('sine', 784, 0.04);
    osc('sine', 1046.5, 0.02);
    rumble('lowpass', 140, 0.7, 0.4);
  } else {
    const deep = rumble('lowpass', 90, 0.7, 1.6);
    lfo(0.13, 0.7, deep.level.gain);
    osc('sine', 38, 0.3);
  }
  return { id, out, sources };
}

/** What plays now and then on top of each stratum's bed. */
const AMBIENT_EVENTS: Record<AmbienceId, Sound> = {
  // A gust of wind.
  wind: (v, p) => noiseBurst(v, { filter: 'bandpass', freq: 450 * p, to: 900 * p, q: 0.8, attack: 0.8, decay: 1.6, gain: 0.5 }),
  // Rock settling somewhere: a low creak and a patter of pebbles.
  drone: (v, p) => {
    tone(v, { type: 'sawtooth', freq: 70 * p, to: 52 * p, attack: 0.3, decay: 0.9, gain: 0.05 });
    for (let i = 0; i < 3; i++) {
      noiseBurst(v, { filter: 'bandpass', freq: 1800 * p, q: 4, delay: 0.25 + i * 0.13 + Math.random() * 0.05, attack: 0.001, decay: 0.03, gain: 0.22 });
    }
  },
  // A drip, and its echo.
  drips: (v, p) => {
    const f = 1400 * p;
    tone(v, { type: 'sine', freq: f, to: f * 0.45, attack: 0.002, decay: 0.07, gain: 0.7 });
    tone(v, { type: 'sine', freq: f * 0.9, to: f * 0.4, delay: 0.16, attack: 0.002, decay: 0.06, gain: 0.2 });
  },
  // A crystal chiming softly, on one of a few notes.
  hum: (v, p) => {
    const f = [1046.5, 1174.7, 1318.5, 1568][Math.floor(Math.random() * 4)] * p;
    tone(v, { type: 'sine', freq: f, attack: 0.01, decay: 1.6, gain: 0.35 });
    tone(v, { type: 'sine', freq: f * 2.76, attack: 0.01, decay: 0.8, gain: 0.07 });
  },
  // A distant boom deep in the rock.
  rumble: (v, p) => {
    noiseBurst(v, { filter: 'lowpass', freq: 220 * p, to: 60 * p, attack: 0.05, decay: 1.8, gain: 1 });
    tone(v, { type: 'sine', freq: 46 * p, to: 32 * p, attack: 0.05, decay: 1.5, gain: 0.5 });
  },
};

/** One of a stratum's ambient events, from somewhere `pan` (-1 left .. 1 right). */
export function ambientEvent(id: AmbienceId, pan = 0): void {
  play({ volume: AMBIENCE_VOLUMES[id], pan, ambience: true }, (v) => AMBIENT_EVENTS[id](v, jitter()));
}
