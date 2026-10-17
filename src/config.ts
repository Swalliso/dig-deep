// Every tunable number in the game lives here.

// --- Tiles and world size ---
export const TILE_SIZE = 16; // px
export const WORLD_WIDTH = 1000; // tiles
export const WORLD_HEIGHT = 600; // tiles
export const CHUNK_SIZE = 32; // tiles per chunk side

// --- Loop ---
export const UPDATE_HZ = 60;
export const MAX_FRAME_TIME = 0.25; // s; longer frames are clamped so the sim doesn't spiral

// --- Rendering ---
// Pixel scale is 3x when the canvas is at least this many device pixels tall, else 2x.
export const SCALE_3X_MIN_HEIGHT = 1000;
export const SKY_TOP_COLOR = '#5fa8e8';
export const SKY_BOTTOM_COLOR = '#bfe3ff';
export const CHUNK_CACHE_LIMIT = 48; // cached chunk canvases kept in memory (~1 MB each)

// --- Background (parallax) ---
// Layers drawn behind the world, back to front, between the sky and the tiles. Each scrolls at
// `factor` times the camera's speed (0 = fixed to the screen, 1 = moves with the world), so far
// layers drift slowly and the world feels bigger. They're generated once per world from its
// seed, as strips BACKGROUND_STRIP_WIDTH world px wide that repeat sideways.
export interface BackgroundLayerSpec {
  kind: 'clouds' | 'mountains' | 'hills';
  factor: number;
  /** World px the layer's horizon sits above the average surface (SURFACE_LEVEL). */
  lift: number;
  /** Height range of the skyline above the horizon, world px. Clouds: the band they float in. */
  minHeight: number;
  maxHeight: number;
  color: string;
  /** Mountains: snow on the high peaks. Hills: tree silhouettes. Clouds: their shaded undersides. */
  accent: string;
  /** Clouds only: world px per second they drift, on top of the parallax. */
  drift?: number;
}
export const BACKGROUND_STRIP_WIDTH = 1024; // world px before a layer repeats
// World px of solid colour under each skyline in its strip; at least BACKGROUND_SHADE_DEPTH, so
// the strip is fully shaded where the plain fill below it takes over.
export const BACKGROUND_FILL_BELOW = 96;
// Skyline layers darken by up to this fraction with depth below their ridge, over
// BACKGROUND_SHADE_DEPTH world px, so big areas of a near layer don't read as a flat wall.
export const BACKGROUND_SHADE = 0.14;
export const BACKGROUND_SHADE_DEPTH = 90;
/** The surface background set. Later strata and biomes get their own sets (ROADMAP Phase 14). */
export const SURFACE_BACKGROUND: readonly BackgroundLayerSpec[] = [
  { kind: 'clouds', factor: 0.04, lift: 110, minHeight: 10, maxHeight: 80, color: '#ffffff', accent: '#d9e9f6', drift: 3 },
  { kind: 'mountains', factor: 0.1, lift: 50, minHeight: 40, maxHeight: 150, color: '#9dbfdc', accent: '#dcebf6' },
  { kind: 'hills', factor: 0.25, lift: 24, minHeight: 20, maxHeight: 70, color: '#89b3a3', accent: '#76a091' },
  { kind: 'hills', factor: 0.45, lift: 4, minHeight: 12, maxHeight: 44, color: '#6f9c76', accent: '#5c8864' },
];
export const TEXTURE_SEED = 1337; // fixed so tile textures look the same in every world

// --- Camera ---
export const CAMERA_FOLLOW_RATE = 8; // 1/s; higher = camera catches up with the player faster

// --- Player movement and physics ---
export const PLAYER_WIDTH = 12; // px
export const PLAYER_HEIGHT = 28; // px
export const RUN_SPEED = 180; // px/s
export const RUN_ACCEL = 2000; // px/s^2 while a direction is held (reaches full speed in ~0.09 s)
export const RUN_FRICTION = 2400; // px/s^2 when no direction is held
export const AIR_CONTROL = 0.65; // fraction of accel/friction that applies in the air
export const GRAVITY = 1400; // px/s^2
export const MAX_FALL_SPEED = 900; // px/s
export const JUMP_VELOCITY = 480; // px/s; full-height jump clears a 4-tile ledge
export const JUMP_CUT = 0.4; // upward speed is multiplied by this when jump is released early
export const COYOTE_TIME = 0.1; // s after leaving the ground that a jump still works
export const JUMP_BUFFER = 0.1; // s before landing that a jump press is remembered
// Corner correction: a jump whose head clips a ceiling edge by at most this much on one side
// slides sideways past it, so jumping up into a 1-tile hole doesn't need perfect alignment.
export const JUMP_CORNER_CORRECTION = 6; // px
export const MAX_MOVE_STEP = 8; // px; movement is split into steps this small so nothing tunnels
// Ladders: W/S on a ladder grabs it; Space hops off, S + Space lets go and drops.
export const CLIMB_SPEED = 140; // px/s up or down (a 100 m shaft takes about 11 s)
export const CLIMB_SIDE_SPEED = 60; // px/s sideways while on a ladder; stepping off its column lets go
export const LADDER_REGRAB_DELAY = 0.25; // s after letting go before the ladder can be grabbed again
export const CLIMB_STEP_DISTANCE = 16; // px climbed per rung sound

// --- Health, falls and respawn (Phase 11b) ---
// Base values for the player's stats; src/systems/stats.ts adds equipment and boons on top.
export const MAX_HEALTH = 10; // HP, drawn as 5 hearts of 2 HP each
// Falls up to this many tiles (from the top of the arc to the landing) never hurt, so normal
// jumps and drops are always safe. Each tile past it costs FALL_DAMAGE_PER_TILE HP (rounded up):
// a 20-tile fall costs 4 HP and anything past 32 tiles is fatal from full health.
export const SAFE_FALL_TILES = 12;
export const FALL_DAMAGE_PER_TILE = 0.5;
// Hurt protection: after taking damage, further damage is ignored for this long, whatever its
// source, so simultaneous hits can't take all your reaction time. The same rule covers every
// hazard (Phase 12's falling blocks too).
export const HURT_PROTECTION = 0.8; // s
export const RESPAWN_PROTECTION = 3; // s of the same protection after respawning
export const REGEN_DELAY = 5; // s without damage before health starts coming back...
export const REGEN_INTERVAL = 3; // ...then 1 HP every this many seconds
// Cues: the red screen flash on taking damage (off with Reduced flashes), the falling "-N" number
// over the player and the shake of the hearts that were lost (always on).
export const HURT_FLASH_ALPHA = 0.35;
export const HURT_FLASH_TIME = 0.3; // s for the red flash to fade
export const DAMAGE_NUMBER_TIME = 0.9; // s the "-N" number floats up from the player
export const HEART_SHAKE_TIME = 0.5; // s the lost hearts shake for
// While protected the player blinks this often, or (with Reduced flashes) is drawn see-through.
export const PROTECTION_BLINK = 0.1; // s per blink phase
export const PROTECTION_ALPHA = 0.5; // player opacity while protected, with Reduced flashes
// The death screen ignores the respawn key for this long, so a key held at the moment of
// death doesn't skip it.
export const DEATH_SCREEN_DELAY = 0.8; // s (real time)
// A respawn with no usable bed searches this many columns either side of the world spawn for
// the top of the ground with room to stand.
export const FALLBACK_SEARCH = 40; // tiles
// A satchel (the bag contents left where you died) is picked up by touching it.
export const SATCHEL_SIZE = 10; // px square

// --- Cave-ins and supports (Phase 12) ---
// Gravel is loose: it rests only on what's directly below it. A tile change rechecks the tiles
// around it (src/world/tileUpdates.ts, at most TILE_UPDATE_BUDGET rechecks per step), and a
// gravel column with nothing holding it up shakes for GRAVEL_WARN_TIME, then falls as blocks
// that land as gravel again. Gravel nobody disturbs stays where it is, even hanging from a
// cave ceiling (it shows dangling pebbles there: it would fall if disturbed).
export const TILE_UPDATE_BUDGET = 256; // tile rechecks per step
export const GRAVEL_WARN_TIME = 0.4; // s of shaking before a loose column falls
export const MAX_FALLING_BLOCKS = 200; // more waiting columns keep shaking until there's room
export const LOOSE_COLUMN_MAX = 32; // tiles a gravel column scan looks through (taller columns fall in parts)
// Supports: a beam (post) holds up the tile above it when its column of beams, at most
// BEAM_MAX_HEIGHT tall, stands on firm ground (any solid tile but gravel, or gravel that rests on
// firm ground). A crossbeam or a platform (span) holds up the tile above it when a tile of its
// row, at most SPAN_MAX tiles along, rests on something: a wall or a standing beam at the end
// of the row, a standing beam or firm ground directly below, or solid rock directly above
// (pinned to the ceiling).
export const BEAM_MAX_HEIGHT = 10; // tiles
export const SPAN_MAX = 4; // tiles
// Supports also reach sideways: the top of a standing beam, and every tile of an anchored
// crossbeam or platform row, hold up loose tiles diagonally above them, up to SUPPORT_REACH
// columns to each side (a solid block holds only the tile right above it). So a beam every few
// tiles, or one crossbeam row, shores a whole gravel ceiling and leaves the space open.
export const SUPPORT_REACH = 1; // tiles
// A falling block that hits the player bursts into a gravel item and does
// GRAVEL_DAMAGE_BASE HP, plus 1 for every GRAVEL_DAMAGE_TILES tiles it fell, at most
// GRAVEL_DAMAGE_MAX. Hurt protection applies, so a whole column landing on you hurts once.
export const GRAVEL_DAMAGE_BASE = 1;
export const GRAVEL_DAMAGE_TILES = 4;
export const GRAVEL_DAMAGE_MAX = 4;
// Warning cues, besides the shake: dust trickling from under shaking gravel (always on, also
// with screen shake and flashes off) and a still orange outline on it.
export const GRAVEL_DUST_RATE = 8; // specks per second per shaking tile
export const GRAVEL_SHAKE_PX = 1; // how far shaking gravel jitters (off with screen shake off)

// --- Mining and building ---
export const REACH = 5; // tiles, measured from the player's centre to the tile's centre
export const CRACK_STAGES = 4;
export const HINT_DURATION = 1.5; // s a "Need better pickaxe" style hint stays up
// A part-mined tile keeps its damage (and cracks) for a while after you stop hitting it, so you
// can come back and finish it, then heals back to full.
export const DAMAGE_REPAIR_DELAY = 3; // s without a hit before the damage starts to heal
export const DAMAGE_REPAIR_TIME = 0.5; // s to heal from fully cracked (less damage heals sooner)
/** Pickaxe tiers; the index is the tier. Break time = tile hardness / speed. */
export const PICKAXES = [
  { name: 'Wooden', speed: 1.0 },
  { name: 'Stone', speed: 1.4 },
  { name: 'Copper', speed: 1.9 },
  { name: 'Iron', speed: 2.6 },
  { name: 'Gold', speed: 3.5 },
] as const;

// --- Break particles ---
export const BREAK_PARTICLES_MIN = 6;
export const BREAK_PARTICLES_MAX = 10;
export const PARTICLE_LIFETIME = 0.6; // s
export const PARTICLE_SPEED = 110; // px/s, maximum initial speed
export const PARTICLE_GRAVITY = 700; // px/s^2

// --- Item drops ---
export const DROP_SIZE = 8; // px
export const DROP_POP_SPEED = 110; // px/s upward kick when a tile breaks
export const DROP_FRICTION = 500; // px/s^2 while resting on the ground
export const DROP_PULL_RANGE = 2; // tiles; closer than this and the drop flies to the player
export const DROP_PULL_ACCEL = 1600; // px/s^2
export const DROP_PULL_MAX_SPEED = 420; // px/s
export const DROP_THROW_SPEED = 120; // px/s forward when the player throws a stack (Q)

// --- Inventory ---
export const HOTBAR_SIZE = 10;
export const BAG_SIZE = 30;
export const MAX_STACK = 999;
export const CHEST_SLOTS = 20;
// Which inventory slots the chest buttons take from. The hotbar is your loadout, so Deposit all
// leaves it alone; Quick stack moves only items the chest already holds, so it takes from the
// hotbar too (that's where pickups land first).
export const DEPOSIT_ALL_HOTBAR = false;
export const QUICK_STACK_HOTBAR = true;

// --- Lighting ---
export const LIGHT_MAX = 16; // full brightness: open sky
export const TORCH_LIGHT = 16; // brightness at a torch's own tile
// Natural light (Phase 13): tiles that glow on their own. Strata place them in new worlds from
// Phase 14; until then they come from the debug kit.
export const GLOWSHROOM_LIGHT = 10; // 5-tile radius
export const GLOW_CRYSTAL_LIGHT = 12; // 6-tile radius
// Glowing tiles also tint the lit tiles around them with their own color (TileDef.glowColor),
// drawn over the darkness. It's only drawn: the light map, dread and healing ignore color.
export const GLOW_TINT_RADIUS = 6; // tiles
export const GLOW_TINT_STRENGTH = 0.45; // how much of the color is added right at the source
export const GLOW_PULSE = 0.2; // a slow pulse, ± this fraction of the strength (off with Reduced flashes)
export const GLOW_PULSE_SPEED = 1.3; // radians per second
export const LIGHT_FALLOFF_AIR = 2; // lost per tile through air and other non-solid tiles (16 / 2 = 8-tile torch radius)
export const LIGHT_FALLOFF_SOLID = 4; // lost per tile into solid blocks, so lit walls fade into the rock
// Light also spreads diagonally, costing a bit more (≈ √2 ×), which rounds a torch's glow
// from a diamond into an octagon.
export const LIGHT_FALLOFF_AIR_DIAGONAL = 3;
export const LIGHT_FALLOFF_SOLID_DIAGONAL = 6;
// A faint glow around the player so nearby walls show even in a pitch-black cave. It only
// brightens what's drawn; it isn't part of the light map, so caves still count as dark.
export const PLAYER_GLOW = 6; // light level at the player's centre (out of LIGHT_MAX = 16)
export const PLAYER_GLOW_FALLOFF = 1.8; // levels lost per tile of distance (6 / 1.8 ≈ 3-tile radius)
export const BACKDROP_BRIGHTNESS = 0.35; // underground backdrop = dirt texture at this brightness

// --- The dark (Phase 13) ---
// A held lantern is a moving light at the player's tile (12 / 2 = 6-tile radius).
export const LANTERN_LIGHT = 12;
// Dread rises while the light level at the player's tile (the light map, not the drawn glow) is
// below this, and drains while it's at least this: in open air that's within 6 tiles of a torch.
export const DREAD_SAFE_LIGHT = 4;
export const DREAD_RISE_TIME = 25; // s of darkness to fill dread from empty
export const DREAD_DRAIN_TIME = 4; // s of light to empty it from full
export const DREAD_HURT_INTERVAL = 2; // s between hits while dread is full...
export const DREAD_HURT = 1; // ...of this many HP
// Cues: a dark red vignette closes in from DREAD_VIGNETTE_FROM (0..1 of the meter) and is
// strongest at full. From DREAD_WARN a slow, quiet heartbeat warns that damage is coming; at
// full it beats every DREAD_HEARTBEAT seconds, and the vignette and the meter pulse with it
// (not with Reduced flashes).
export const DREAD_VIGNETTE_FROM = 0.4;
export const DREAD_VIGNETTE_ALPHA = 0.55; // edge strength at full dread
export const DREAD_WARN = 0.75;
export const DREAD_HEARTBEAT_SLOW = 1.3; // s between beats from DREAD_WARN
export const DREAD_HEARTBEAT = 0.8; // s between beats when full
export const DREAD_PULSE_TIME = 0.25; // s a beat's pulse lasts on screen
// Flares: left-click throws one toward the cursor. It flies under gravity, sticks to the first
// solid tile it touches and lights a big area (FLARE_LIGHT / 2 = 11 tiles) for FLARE_TIME
// seconds of play, dimming over its last FLARE_FADE seconds. Its light is carried light: it
// keeps dread away but doesn't heal.
export const FLARE_LIGHT = 22;
export const FLARE_TIME = 30; // s
export const FLARE_FADE = 4; // s
export const FLARE_THROW_SPEED = 560; // px/s
export const FLARE_GRAVITY = 600; // px/s^2 (a flat throw carries ~9 tiles, aimed up ~25)
export const FLARE_MAX = 6; // burning at once; throwing another burns the oldest out

// --- Sound (synthesized in src/audio/sfx.ts) ---
// Volume settings are 0..1 sliders; the gain applied is the square, which sounds more even.
export const DEFAULT_MASTER_VOLUME = 0.8;
export const DEFAULT_SFX_VOLUME = 0.8;
export const SFX_MAX_VOICES = 32; // sounds playing at once; any more are skipped
export const SFX_PITCH_JITTER = 0.05; // each sound's pitch varies by up to +/- this fraction
export const SFX_PAN = 0.45; // stereo pan of a tile sound at the edge of reach (0 = none, 1 = hard left/right)
/** Loudness of each sound before the volume settings. */
export const SFX_VOLUMES = {
  dig: 0.3,
  break: 0.55,
  pickup: 0.22,
  place: 0.45,
  craft: 0.4,
  step: 0.22,
  jump: 0.18,
  land: 0.5,
  ui: 0.3,
  door: 0.4,
  hurt: 0.55,
  death: 0.6,
  bed: 0.4,
  rumble: 0.45,
  gravelLand: 0.4,
  heartbeat: 0.6,
  flare: 0.4,
} as const;
export const SFX_SAME_SOUND_GAP = 0.03; // s; the same sound (e.g. a break of one material) plays at most this often
export const DIG_TICK_INTERVAL = 0.13; // s between dig ticks while holding the mine button on a tile
export const DIG_TICK_FREQ = 180; // Hz of a dig tick on a tile of hardness 0...
export const DIG_TICK_FREQ_PER_HARDNESS = 320; // ...plus this per point of hardness (dirt ~280 Hz, deepstone ~980 Hz)
export const PICKUP_FREQ = 523; // Hz (C5) of the first blip in a run of pickups
export const PICKUP_RUN_WINDOW = 0.6; // s; a pickup this soon after the last one climbs a step of the scale
export const PICKUP_RUN_STEPS = 10; // pentatonic steps a run can climb (10 = two octaves)
export const PICKUP_SPACING = 0.05; // s; pickups in the same moment play one after another, as an arpeggio
export const PICKUP_MAX_DELAY = 0.3; // s; pickups that would queue up longer than this are skipped
export const FOOTSTEP_DISTANCE = 26; // px walked per footstep (~7 a second at full speed)
export const LAND_MIN_SPEED = 250; // px/s; landing faster than this thuds and kicks up dust (a 2-tile drop or a jump)
export const LAND_FULL_SPEED = 750; // px/s; the thud and the dust puff are at full size from here up

// --- Juice ---
// Screen shake on breaking a tile: a "trauma" of hardness x SHAKE_PER_HARDNESS (at most 1)
// shakes the view up to SHAKE_MAX world px, fading out at SHAKE_DECAY per second. A new break
// shakes at least as hard as its own trauma; breaks don't add up.
export const SHAKE_MAX = 3; // px
export const SHAKE_PER_HARDNESS = 0.35; // dirt barely moves, stone ~1 px, deepstone ~2.6 px
export const SHAKE_DECAY = 4; // trauma lost per second
// A broken tile flashes white for one frame, more opaque the harder it was.
export const BREAK_FLASH_ALPHA = 0.3; // at hardness 0...
export const BREAK_FLASH_ALPHA_PER_HARDNESS = 0.2; // ...plus this per point of hardness...
export const BREAK_FLASH_ALPHA_MAX = 0.8; // ...up to this
// Dust puff when the player lands (see LAND_MIN_SPEED).
export const DUST_PARTICLES_MIN = 3;
export const DUST_PARTICLES_MAX = 10;
export const DUST_LIFETIME = 0.45; // s
export const DUST_SPEED = 70; // px/s, sideways
export const DUST_RISE = 25; // px/s, upward drift
export const DUST_DRAG = 6; // 1/s; how fast the puff slows down
// Ores glint now and then wherever they're lit: each ore tile glints once per SPARKLE_PERIOD
// (at a random moment of its own), for SPARKLE_DURATION.
export const SPARKLE_PERIOD = 3; // s
export const SPARKLE_DURATION = 0.4; // s
export const SPARKLE_ALPHA = 0.85; // brightest glint, on a fully lit ore
export const SPARKLE_MIN_LIGHT = 3; // light level (out of LIGHT_MAX) below which ores don't glint

// --- Map ---
// The map shows only tiles you've seen: on screen while lit (light level above 0), or within
// EXPLORE_RADIUS tiles of the player even in the dark.
export const EXPLORE_RADIUS = 5; // tiles
export const EXPLORE_INTERVAL = 0.1; // s between looks around (cheap: just the tiles on screen)
export const MAP_SKY_COLOR = '#8cc6f2'; // air above the surface on the map
export const MAP_CAVE_COLOR = '#2a2018'; // dug-out or cave air below the surface
export const MAP_FOG_COLOR = '#0c0c12'; // tiles not seen yet
// Full map (M): zoom levels in UI units per tile (a UI unit is one world pixel on screen, so
// 2 or 3 screen pixels); it opens at MAP_ZOOM_START.
export const MAP_ZOOMS = [0.25, 0.5, 1, 2, 4, 8] as const;
export const MAP_ZOOM_START = 3; // index into MAP_ZOOMS
export const MAP_PAN_SPEED = 300; // UI units per second when panning with WASD or the arrow keys
// Minimap (corner, N toggles): its size in UI units, at one tile per UI unit.
export const MINIMAP_WIDTH = 100;
export const MINIMAP_HEIGHT = 64;
// Map pins (right-click the full map): named marks on explored tiles. One can be tracked, which
// shows its direction and distance on the HUD and on the minimap.
export const MAP_PIN_MAX = 12;
export const MAP_PIN_NAME_MAX = 18; // characters
export const MAP_PIN_HIT = 6; // UI units: how close to a pin a right-click picks it rather than adding one

// --- Quick torch (T) ---
// Places a carried torch at the cursor, or when that spot can't take one, at the spot nearest
// the player's centre within this many tiles.
export const QUICK_TORCH_RADIUS = 2; // tiles

// --- HUD ---
export const TOAST_DURATION = 1.5; // s
export const TOAST_FADE = 0.5; // s of fade-out at the end of a toast
export const MAX_TOASTS = 5;

// --- Saving ---
export const AUTOSAVE_INTERVAL = 60; // s of play between automatic saves (also saves on pause)
// Browsers drop IndexedDB writes made while a page unloads, so a reload would lose everything
// since the last autosave. Instead, anything that changed is saved within this many seconds.
export const SAVE_CHANGES_AFTER = 2; // s

// --- Debug mode (?debug in the URL) ---
export const DEBUG_FLY_SPEED = 300; // px/s
export const DEBUG_FLY_FAST = 4; // speed multiplier while Shift is held

// --- Crafting ---
export const STATION_RANGE = 4; // tiles; a workbench/furnace this close (centre to centre) counts
// Chests within STATION_RANGE also lend their items to crafting, and take quick stacks (C).
export const CRAFT_MANY = 10; // batches made by shift-clicking a recipe

// --- World generation ---
// Average surface row. Depth (in m) = ty - SURFACE_LEVEL, so the depth meter reads 0 here.
export const SURFACE_LEVEL = 120;
export const SURFACE_AMPLITUDE = 25; // surface varies +/- this many tiles
export const SURFACE_NOISE_SCALES = [180, 70, 25]; // tiles per noise period, per octave
export const SURFACE_NOISE_WEIGHTS = [0.65, 0.27, 0.08];

export const DIRT_DEPTH_MIN = 10;
export const DIRT_DEPTH_MAX = 18;
export const DIRT_NOISE_SCALE = 40;

export const DEEPSTONE_ROW = 350; // absolute row where deepstone begins
export const DEEPSTONE_JITTER = 8; // +/- tiles of noise on that boundary
export const DEEPSTONE_NOISE_SCALE = 30;

export const CAVE_NOISE_SCALE_X = 48;
export const CAVE_NOISE_SCALE_Y = 28;
export const CAVE_DETAIL_SCALE = 0.4; // second octave scale, relative to the first
export const CAVE_DETAIL_WEIGHT = 0.3; // second octave share of the cave noise
export const CAVE_THRESHOLD_SHALLOW = 0.55; // noise must exceed this to carve near the surface
export const CAVE_THRESHOLD_DEEP = 0.28; // ...and this at the bottom of the world
export const CAVE_SOLID_CRUST = 8; // tiles under the surface that stay mostly solid
export const CAVE_CRUST_HARD = 3; // top tiles of the crust that are never carved
export const CAVE_CRUST_PENALTY = 0.45; // extra threshold at the top of the crust, fading out

export const BEDROCK_BOTTOM_ROWS = 3;

export const TREE_SPACING_MIN = 6;
export const TREE_SPACING_MAX = 15;
export const TREE_TRUNK_MIN = 4;
export const TREE_TRUNK_MAX = 7;
export const TREE_EDGE_MARGIN = 4; // no trees this close to the world edges
export const TREE_LEAF_RAGGEDNESS = 0.3; // chance each edge leaf of the blob is left out
export const TREE_FELL_RADIUS = 3; // a felled tree takes leaves up to this many columns from its trunk

export interface OreSpec {
  minDepth: number; // m below SURFACE_LEVEL
  maxDepth: number;
  tilesPerVein: number; // one vein per this many tiles of the depth band
  veinMin: number;
  veinMax: number;
}

export const ORE_COAL: OreSpec = { minDepth: 20, maxDepth: 200, tilesPerVein: 500, veinMin: 3, veinMax: 8 };
export const ORE_COPPER: OreSpec = { minDepth: 30, maxDepth: 250, tilesPerVein: 700, veinMin: 3, veinMax: 8 };
export const ORE_IRON: OreSpec = { minDepth: 120, maxDepth: 400, tilesPerVein: 900, veinMin: 3, veinMax: 8 };
export const ORE_GOLD: OreSpec = { minDepth: 250, maxDepth: 550, tilesPerVein: 1300, veinMin: 3, veinMax: 8 };

/**
 * Gravel pockets (the 'gravel' generation profile, Phase 12): blobs of gravel in stone. A
 * share of them sit on cave ceilings, hanging from them (they fall once disturbed), and
 * deeper ones sometimes hold ore near their bottom, worth shoring up before mining.
 */
export interface GravelSpec {
  minDepth: number; // m below SURFACE_LEVEL; none above this
  tilesPerPocket: number; // one pocket per this many tiles of the band
  radiusMin: number; // tiles, sideways (pockets are wider than tall)
  radiusMax: number;
  gentleDepth: number; // m; pockets above this depth are small (a forgiving first meeting)
  gentleRadiusMax: number;
  ceilingShare: number; // 0..1 of pockets moved onto a cave ceiling, if one is near
  ceilingSearch: number; // rows searched downward for a cave ceiling
  richMinDepth: number; // m; ceiling pockets this deep may hold ore...
  richChance: number; // ...with this chance...
  richOres: number; // ...this many ore tiles, in their bottom rows
}

export const GRAVEL_POCKETS: GravelSpec = {
  minDepth: 12,
  tilesPerPocket: 1100,
  radiusMin: 2,
  radiusMax: 4,
  gentleDepth: 45,
  gentleRadiusMax: 2,
  ceilingShare: 0.55,
  ceilingSearch: 24,
  richMinDepth: 30,
  richChance: 0.6,
  richOres: 4,
};

// Generation runs in slices across frames so the loading screen can show progress.
export const GEN_FRAME_BUDGET_MS = 12;
