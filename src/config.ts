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
  /**
   * Surface layers: clouds, mountains, hills. Underground (strata) layers repeat both ways: rock
   * ledges with stalactites, giant mushrooms, crystals or basalt columns on them.
   */
  kind: 'clouds' | 'mountains' | 'hills' | 'stalactites' | 'mushrooms' | 'crystals' | 'columns';
  factor: number;
  /**
   * World px the layer's horizon sits above the average surface (SURFACE_LEVEL). Underground
   * layers: how far their ledges are shifted down, so two layers' ledges don't line up.
   */
  lift: number;
  /** Height range of the skyline above the horizon, world px. Clouds: the band they float in. Underground: the formations. */
  minHeight: number;
  maxHeight: number;
  color: string;
  /**
   * Mountains: snow on the high peaks. Hills: tree silhouettes. Clouds: their shaded undersides.
   * Underground: highlights (mushroom caps, crystal faces, glowing cracks).
   */
  accent: string;
  /** Clouds only: world px per second they drift, on top of the parallax. */
  drift?: number;
  /** Underground only: world px from one ledge to the next (the strip's height). */
  period?: number;
}
export const BACKGROUND_STRIP_WIDTH = 1024; // world px before a layer repeats
// World px of solid colour under each skyline in its strip; at least BACKGROUND_SHADE_DEPTH, so
// the strip is fully shaded where the plain fill below it takes over.
export const BACKGROUND_FILL_BELOW = 96;
// Skyline layers darken by up to this fraction with depth below their ridge, over
// BACKGROUND_SHADE_DEPTH world px, so big areas of a near layer don't read as a flat wall.
export const BACKGROUND_SHADE = 0.14;
export const BACKGROUND_SHADE_DEPTH = 90;
/** The surface background set. Each stratum below Topsoil has its own set (STRATA_LOOKS). */
export const SURFACE_BACKGROUND: readonly BackgroundLayerSpec[] = [
  { kind: 'clouds', factor: 0.04, lift: 110, minHeight: 10, maxHeight: 80, color: '#ffffff', accent: '#d9e9f6', drift: 3 },
  { kind: 'mountains', factor: 0.1, lift: 50, minHeight: 40, maxHeight: 150, color: '#9dbfdc', accent: '#dcebf6' },
  { kind: 'hills', factor: 0.25, lift: 24, minHeight: 20, maxHeight: 70, color: '#89b3a3', accent: '#76a091' },
  { kind: 'hills', factor: 0.45, lift: 4, minHeight: 12, maxHeight: 44, color: '#6f9c76', accent: '#5c8864' },
];
/**
 * How each stratum below Topsoil looks behind dug-out spaces and caves (strata worlds only): a
 * backdrop colour (its tint) with parallax layers over it, far to near. Topsoil keeps the dirt
 * backdrop, and worlds without strata keep it all the way down. Darkness covers all of it, so it
 * only shows where there's light.
 */
export interface StratumLook {
  backdrop: string;
  background: readonly BackgroundLayerSpec[];
}
export const STRATA_LOOKS: readonly StratumLook[] = [
  // Stone Caverns: grey ledges with stalactites and stalagmites.
  {
    backdrop: '#17171c',
    background: [
      { kind: 'stalactites', factor: 0.12, lift: 0, minHeight: 10, maxHeight: 48, color: '#222229', accent: '#2b2b34', period: 176 },
      { kind: 'stalactites', factor: 0.3, lift: 70, minHeight: 8, maxHeight: 36, color: '#2c2c35', accent: '#383844', period: 144 },
    ],
  },
  // Fungal Hollows: giant mushrooms on damp green ledges, roots hanging under them.
  {
    backdrop: '#111916',
    background: [
      { kind: 'mushrooms', factor: 0.12, lift: 0, minHeight: 20, maxHeight: 58, color: '#1a2521', accent: '#2c2340', period: 176 },
      { kind: 'mushrooms', factor: 0.3, lift: 64, minHeight: 14, maxHeight: 42, color: '#22312b', accent: '#3d2d55', period: 144 },
    ],
  },
  // Geode Depths: violet crystal clusters growing up and down from the ledges.
  {
    backdrop: '#141029',
    background: [
      { kind: 'crystals', factor: 0.12, lift: 0, minHeight: 12, maxHeight: 50, color: '#1f1936', accent: '#3a2c66', period: 176 },
      { kind: 'crystals', factor: 0.3, lift: 60, minHeight: 10, maxHeight: 38, color: '#29223f', accent: '#5a44a2', period: 144 },
    ],
  },
  // Magma Layer: jagged basalt columns over cracks that glow a dull orange.
  {
    backdrop: '#1c0f0c',
    background: [
      { kind: 'columns', factor: 0.12, lift: 0, minHeight: 14, maxHeight: 52, color: '#291612', accent: '#5c200d', period: 176 },
      { kind: 'columns', factor: 0.3, lift: 58, minHeight: 10, maxHeight: 40, color: '#361e17', accent: '#8c3512', period: 144 },
    ],
  },
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
// Walking off a ledge into a ladder (or rope) column catches you on it once you have fallen this
// far, so walking into a shaft isn't a long fall but stepping down a small ledge beside a rope
// doesn't latch on. W or S grab one at any height.
export const WALK_OFF_CATCH_TILES = 3;

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

// --- Lifts and the camp (Phase 15) ---
// A lift cage rides a column of lift rail between the lift stops placed beside it. It speeds up
// to LIFT_SPEED (ladders climb at about 9 tiles/s) and slows down to stop level with a stop.
export const LIFT_SPEED = 800; // px/s (50 tiles/s: a 300 m ride takes about 7 s)
export const LIFT_ACCEL = 640; // px/s² (40 tiles/s², both speeding up and slowing down)
export const LIFT_MIN_SPEED = 32; // px/s; the slowest it creeps in the last pixels before a stop
export const LIFT_RATTLE_DISTANCE = 96; // px travelled per rattle of the cage on its rail
export const LIFT_RAILS_PER_BAR = 16; // lift rails crafted from one iron bar (and 2 planks)
export const LIFT_PANEL_ROWS = 9; // stops listed at once in the lift panel (the wheel scrolls)
export const LIFT_STOP_NAME_MAX = 18; // characters
// The camp's stove is a campfire: established light (it heals and keeps dread away, like a
// torch's), so a camp is a safe spot to rest wherever it's set up. The damp doesn't dim it.
export const CAMP_LIGHT = 14; // 7-tile radius (a torch lights 8)

// --- Gear and tools (Phase 16) ---
// Accessories go in GEAR_SLOTS slots in the inventory panel (one of each at most) and add to the
// player's stats (src/systems/stats.ts). Each adds:
export const GEAR_SLOTS = 4;
export const HELMET_LIGHT = 4; // tiles of carried light (like the lantern's: keeps dread off, doesn't heal)
export const TOOLBELT_RANGE = 4; // tiles of crafting station (and chest) range
export const MAGNET_RANGE = 3; // tiles of pickup range
export const GRIP_REACH = 1.5; // tiles of reach
export const SPRING_BOOTS_JUMP = 70; // px/s of jump speed (about 1.6 tiles higher)
export const PADDED_BOOTS_FALL = 8; // tiles of safe fall height
// The heat ward stretches the time between heat burns by this much (doubling it).
export const HEAT_WARD_INTERVAL = 1.5; // s, the same as HEAT_HURT_INTERVAL
// Climbing claws: in the air, pushing against a wall slides down it at WALL_SLIDE_SPEED at
// most (a slide never counts as a fall), holding up as well clings still, and a jump press
// (without up) jumps off it, away from the wall.
export const WALL_SLIDE_SPEED = 90; // px/s
export const WALL_JUMP_PUSH = 220; // px/s away from the wall
// Bombs: left-click throws one at the cursor. It sticks where it lands and goes off after
// BOMB_FUSE seconds of play, breaking every tile in the 3 x 3 around it that the best carried
// pickaxe could mine (never bedrock), with the usual drops. Anyone in the 5 x 5 around it
// (the blast plus a tile) takes BOMB_DAMAGE.
export const BOMB_FUSE = 2; // s
export const BOMB_DAMAGE = 4; // HP
export const BOMB_THROW_SPEED = 420; // px/s
export const BOMB_GRAVITY = 900; // px/s^2
export const BOMB_MAX = 8; // fused at once; throwing another sets off the oldest early
// Rope coil: hung from an empty spot (with something solid above it or beside it), it unrolls
// a rope ladder straight down, through open space, up to ROPE_LENGTH tiles. Breaking any part of
// it rolls the whole rope back up into coils. When the tile under its end opens up, it unrolls
// further into the open, up to the rest of its coils (at most ROPE_UNROLL_BUDGET ropes a step).
export const ROPE_LENGTH = 20; // tiles
export const ROPE_UNROLL_BUDGET = 8; // ropes unrolled into new air per step
// Drill: mines at least the emberite pickaxe's tier, much faster, as long as there's coal to
// burn: one coal per DRILL_TILES_PER_COAL tiles broken.
export const DRILL_TIER = 5;
export const DRILL_SPEED = 9;
export const DRILL_TILES_PER_COAL = 8;

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
  { name: 'Emberite', speed: 4.6 }, // Phase 14a: from the Magma Layer's emberite ore, which needs gold
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
// Natural light (Phase 13): tiles that glow on their own. In strata worlds glowshrooms grow in the
// Fungal Hollows and glow crystals in the Geode Depths (Phase 14a).
export const GLOWSHROOM_LIGHT = 10; // 5-tile radius
export const GLOW_CRYSTAL_LIGHT = 12; // 6-tile radius
// Gem lamps (Phase 14a, a ruby or sapphire set in gold) are brighter than torches: past LIGHT_MAX
// a tile is simply fully lit, so they light further rather than brighter.
export const LAMP_LIGHT = 20; // 10-tile radius (a torch lights 8)
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

// --- Strata rules (Phase 14b) ---
// Fungal Hollows, damp: a torch there lights a smaller radius (only torches: lanterns, flares,
// gem lamps and glowshrooms are unaffected). The damp fades in over the Hollows' top
// DAMP_FADE_ROWS rows, so the first torches there are only a little dimmer.
export const DAMP_TORCH_LIGHT = 10; // 5-tile radius (a dry torch lights 8)
export const DAMP_FADE_ROWS = 12;
// Geode Depths, floatstone: within FLOAT_RADIUS tiles of a floatstone tile (they grow in the huge
// crystal caverns), gravity is FLOAT_GRAVITY times as strong and falls are slower and cushioned:
// a fall only counts from where the player leaves the field.
export const FLOATSTONE_LIGHT = 8; // 4-tile radius
export const FLOAT_RADIUS = 5; // tiles, from the player's centre tile
export const FLOAT_GRAVITY = 0.4;
export const FLOAT_MAX_FALL = 0.45; // times MAX_FALL_SPEED
export const FLOAT_BRAKE = 2400; // px/s^2: falling faster than that slows down this quickly
// Magma Layer, heat: lava and hot rock heat the tiles around them. Heat spreads one level less
// per tile through anything but insulating tiles (bricks, heartstone, closed doors), so a tile
// is hot within (heat - 1) tiles of a source by a path that doesn't cross insulation.
export const LAVA_LIGHT = 12; // 6-tile radius
export const LAVA_HEAT = 4; // hot 3 tiles around
export const HOT_ROCK_LIGHT = 6;
export const HOT_ROCK_HEAT = 3; // hot 2 tiles around
// Standing in a hot zone is safe for HEAT_GRACE seconds; after that it burns HEAT_HURT every
// HEAT_HURT_INTERVAL. Out of the heat the grace comes back HEAT_COOL_RATE times as fast as it
// ran out. Touching lava hurts LAVA_HURT straight away (then again after the hurt protection).
// Timed on the session clock; none of it hurts in Cozy worlds.
export const HEAT_GRACE = 4; // s
export const HEAT_COOL_RATE = 2;
export const HEAT_HURT_INTERVAL = 1.5; // s
export const HEAT_HURT = 1;
export const LAVA_HURT = 2;
// Cues: hot tiles shimmer orange (HEAT_TINT_ALPHA at the hottest, still with Reduced flashes,
// only without the shimmer), and an orange vignette closes in as the grace runs out.
export const HEAT_TINT_ALPHA = 0.22;
export const HEAT_VIGNETTE_ALPHA = 0.5;
// The Heart of the Deep: a sealed chamber of heartstone (needs the emberite pickaxe) just above
// the bedrock. Breaking the Heart inside is the Sandbox's goal; it drops the Heart, a trophy
// that glows wherever it's placed.
export const HEARTSTONE_LIGHT = 6;
export const HEART_LIGHT = 20; // 10-tile radius
export const HEART_BANNER_TIME = 9; // s the completion banner shows

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
  sizzle: 0.4,
  heart: 0.6,
  lift: 0.4,
  bomb: 0.7,
} as const;
export const SFX_SAME_SOUND_GAP = 0.03; // s; the same sound (e.g. a break of one material) plays at most this often
// Mixing (playtest P1-01): effects play through their own limiter, which holds a pile-up of
// sounds down without touching the ambience, and the master has a limiter that only catches what
// would still clip. Neither engages when felling or digging fast, even with every volume at 100%
// (measured offline). Web Audio's compressor adds makeup gain that grows as its threshold drops:
// the effects limiter's (+2.8 dB) and AMBIENCE_TRIM keep the default volumes about as loud as the
// old 12:1 master compressor (with its +3.7 dB) made them.
export const SFX_LIMIT_THRESHOLD = -6; // dBFS where the effects limiter starts holding sounds down
export const SFX_LIMIT_ATTACK = 0.005; // s
export const SFX_LIMIT_RELEASE = 0.15; // s
export const MASTER_LIMIT_THRESHOLD = -1; // dBFS
export const MASTER_LIMIT_ATTACK = 0.003; // s
export const MASTER_LIMIT_RELEASE = 0.1; // s
export const LIMITER_RATIO = 12;
export const LIMITER_KNEE = 3; // dB
export const AMBIENCE_TRIM = 1.45; // fixed gain on the ambience bus, under the settings' volume
export const AMBIENCE_MAX_VOICES = 6; // ambient events playing at once (their own budget, apart from SFX_MAX_VOICES)
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

// --- Ambience (Phase 14a, strata worlds) ---
// Each stratum has a quiet bed of sound that plays while you're in it (wind, a cave drone, damp
// air, a crystal hum, a low rumble), crossfading over AMBIENCE_FADE when you cross into another,
// plus now and then an event on top (a gust, a creak, a drip, a chime, a distant boom), timed on
// the session clock so it stops while the world is paused. It has its own volume setting.
export const DEFAULT_AMBIENCE_VOLUME = 0.6;
export const AMBIENCE_FADE = 1.5; // s
export const AMBIENCE_DUCK = 0.35; // the bed's level while the inventory, the map or the death screen is up
/** Loudness of each stratum's bed (and its events) before the volume settings. */
export const AMBIENCE_VOLUMES = { wind: 0.5, drone: 0.55, drips: 0.5, hum: 0.4, rumble: 0.65 } as const;
export type AmbienceId = keyof typeof AMBIENCE_VOLUMES;
/** Seconds of play between a stratum's ambient events, random between the two. */
export const AMBIENCE_EVENT_GAPS: Record<AmbienceId, readonly [number, number]> = {
  wind: [6, 14],
  drone: [5, 12],
  drips: [0.5, 2.2],
  hum: [3, 8],
  rumble: [6, 14],
};

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
// Entering a stratum (strata worlds) shows its name and depth near the top of the screen for
// BANNER_TIME, fading in and out over BANNER_FADE. A stratum only counts as entered once the
// player is BANNER_HYSTERESIS tiles past its boundary, so walking along one doesn't flicker.
export const BANNER_TIME = 4; // s
export const BANNER_FADE = 0.6; // s
export const BANNER_HYSTERESIS = 2; // tiles

// --- Saving ---
export const AUTOSAVE_INTERVAL = 60; // s of play between automatic saves (also saves on pause)
// Browsers drop IndexedDB writes made while a page unloads, so a reload would lose everything
// since the last autosave. Instead, anything that changed is saved within this many seconds.
export const SAVE_CHANGES_AFTER = 2; // s

// --- Debug mode (?debug in the URL) ---
export const DEBUG_FLY_SPEED = 300; // px/s
export const DEBUG_FLY_FAST = 4; // speed multiplier while Shift is held
// Y (next stratum) looks for open space this many rows into the next stratum and this many
// columns either side of the player before carving a pocket at the stratum's top.
export const DEBUG_STRATUM_SEARCH_ROWS = 30;
export const DEBUG_STRATUM_SEARCH_COLUMNS = 40;

// --- Renewable wood (Phase 14a) ---
// Leaves drop a sapling now and then (felled canopies too), and giant mushroom caps drop
// mushroom spores. Planted (a sapling on grass or dirt, spores on mudstone), they grow into a
// tree or a giant mushroom after PLANT_GROW_MIN..PLANT_GROW_MAX seconds of play, if they can
// then: a sapling needs open sky, room above it and no other trunk within PLANT_SPACING columns;
// spores need room for the whole mushroom. One that can't starts a fresh grow time. Growth runs
// on the session clock, checked every PLANT_CHECK_INTERVAL.
export const SAPLING_CHANCE = 0.12;
export const SPORE_CHANCE = 0.15;
export const PLANT_GROW_MIN = 240; // s
export const PLANT_GROW_MAX = 420; // s
export const PLANT_CHECK_INTERVAL = 1; // s
export const PLANT_SPACING = 3; // columns either side of a sapling that must be free of trunks (three clear tiles between trees)
export const GIANT_MUSHROOM_STEM_MIN = 3; // tiles under the cap
export const GIANT_MUSHROOM_STEM_MAX = 6;

// --- Crafting ---
export const STATION_RANGE = 4; // tiles; a workbench/furnace this close (centre to centre) counts
// Chests within STATION_RANGE also lend their items to crafting, and take quick stacks (C).
export const CRAFT_MANY = 10; // batches made by shift-clicking a recipe
export const RECIPE_SEARCH_MAX = 20; // characters typed into the crafting panel's search box (Phase 16)

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
  /**
   * Strata worlds: the stratum (index into STRATA, 1 = Stone Caverns) whose rock the ore replaces.
   * Its veins stay inside that stratum's wandering boundaries; the depths are the nominal band.
   */
  stratum?: number;
}

export const ORE_COAL: OreSpec = { minDepth: 20, maxDepth: 200, tilesPerVein: 500, veinMin: 3, veinMax: 8 };
export const ORE_COPPER: OreSpec = { minDepth: 30, maxDepth: 250, tilesPerVein: 700, veinMin: 3, veinMax: 8 };
export const ORE_IRON: OreSpec = { minDepth: 120, maxDepth: 400, tilesPerVein: 900, veinMin: 3, veinMax: 8 };
export const ORE_GOLD: OreSpec = { minDepth: 250, maxDepth: 550, tilesPerVein: 1300, veinMin: 3, veinMax: 8 };

// Ores re-banded per stratum (the 'strata' profile): each one only in its own stratum's rock.
export const STRATA_COAL: OreSpec = { stratum: 1, minDepth: 15, maxDepth: 110, tilesPerVein: 450, veinMin: 3, veinMax: 8 };
export const STRATA_COPPER: OreSpec = { stratum: 1, minDepth: 25, maxDepth: 110, tilesPerVein: 600, veinMin: 3, veinMax: 8 };
export const STRATA_IRON: OreSpec = { stratum: 2, minDepth: 110, maxDepth: 230, tilesPerVein: 750, veinMin: 3, veinMax: 8 };
export const STRATA_GOLD: OreSpec = { stratum: 3, minDepth: 230, maxDepth: 350, tilesPerVein: 1000, veinMin: 3, veinMax: 8 };
export const STRATA_RUBY: OreSpec = { stratum: 3, minDepth: 230, maxDepth: 350, tilesPerVein: 2400, veinMin: 2, veinMax: 4 };
export const STRATA_SAPPHIRE: OreSpec = { stratum: 3, minDepth: 230, maxDepth: 350, tilesPerVein: 2400, veinMin: 2, veinMax: 4 };
export const STRATA_EMBERITE: OreSpec = { stratum: 4, minDepth: 350, maxDepth: 480, tilesPerVein: 1100, veinMin: 3, veinMax: 7 };

/**
 * Strata (the 'strata' generation profile, Phase 14a): depth bands with their own rock, ores and
 * growths. Each boundary wanders by up to `jitter` tiles per column. Topsoil ends at the first
 * boundary or the bottom of the dirt, whichever is deeper, so a valley's grass is never in the
 * Stone Caverns.
 */
export interface StrataGenSpec {
  /** m below SURFACE_LEVEL where Stone Caverns, Fungal Hollows, Geode Depths and the Magma Layer start. */
  tops: readonly [number, number, number, number];
  jitter: number;
  noiseScale: number; // tiles per noise period along a boundary
  /** Glowshrooms on Fungal Hollows cave floors: thick in patches (where patch noise beats patchThreshold), rare elsewhere. */
  glowshroomPatchScale: number;
  glowshroomPatchThreshold: number;
  glowshroomPatchChance: number;
  glowshroomChance: number;
  /** Chance a Fungal Hollows floor spot with room grows a giant mushroom, then at least this many columns to the next. */
  giantMushroomChance: number;
  giantMushroomSpacing: number;
  /**
   * Huge crystal caverns in the Geode Depths: carved where low-frequency noise beats the
   * threshold, which rises by cavernEdgePenalty per tile closer than cavernEdge to the band's
   * edges, so caverns round off inside the Geode Depths instead of breaking into the next stratum.
   */
  cavernScaleX: number;
  cavernScaleY: number;
  cavernThreshold: number;
  cavernEdge: number;
  cavernEdgePenalty: number;
  /** Chance a Geode Depths rock face is a glow crystal: in the huge caverns, and elsewhere. */
  crystalCavernChance: number;
  crystalChance: number;
}

export const STRATA_GEN: StrataGenSpec = {
  tops: [15, 110, 230, 350],
  jitter: 8,
  noiseScale: 30,
  glowshroomPatchScale: 26,
  glowshroomPatchThreshold: 0.2,
  glowshroomPatchChance: 0.5,
  glowshroomChance: 0.04,
  giantMushroomChance: 0.07,
  giantMushroomSpacing: 4,
  cavernScaleX: 80,
  cavernScaleY: 26,
  cavernThreshold: 0.5,
  cavernEdge: 8,
  cavernEdgePenalty: 0.05,
  crystalCavernChance: 0.18,
  crystalChance: 0.012,
};

/**
 * The strata's rules in generation (strata profile v2, Phase 14b): floatstone in the Geode
 * Depths' huge caverns, hot rock and lava pools in the Magma Layer, and the Heart of the Deep's
 * chamber above the bedrock.
 */
export interface DepthsGenSpec {
  /** Chance a rock face inside a huge crystal cavern is floatstone. */
  floatstoneChance: number;
  /** No hot rock or lava in the Magma Layer's top rows: its first caves are a safe place to learn heat. */
  gentleRows: number;
  /** Hot rock veins, replacing basalt below the gentle rows. */
  hotRockTilesPerVein: number;
  hotRockVeinMin: number;
  hotRockVeinMax: number;
  /**
   * Lava pools: a stretch of cave floor at least poolMinRun tiles long becomes a pool (one or two
   * tiles deep, with a rock rim at each end) with this chance, rising from half at the gentle
   * rows to all of it at the bottom.
   */
  lavaPoolChance: number;
  poolMinRun: number;
  poolMaxRun: number;
  /** The Heart's chamber: shell size (walls included), wall thickness and the cavern around it. */
  heartWidth: number;
  heartHeight: number;
  heartWall: number;
  heartCavernMargin: number;
  heartCavernHeight: number;
  /** How far from the spawn column it is, either way. */
  heartOffsetMin: number;
  heartOffsetMax: number;
}

export const DEPTHS_GEN: DepthsGenSpec = {
  floatstoneChance: 0.05,
  gentleRows: 20,
  hotRockTilesPerVein: 350,
  hotRockVeinMin: 4,
  hotRockVeinMax: 10,
  lavaPoolChance: 0.75,
  poolMinRun: 4,
  poolMaxRun: 14,
  heartWidth: 13,
  heartHeight: 9,
  heartWall: 2,
  heartCavernMargin: 6,
  heartCavernHeight: 15,
  heartOffsetMin: 80,
  heartOffsetMax: 220,
};

/**
 * Caverns in one stratum (strata v3): open air where low-frequency noise beats the threshold,
 * which rises by edgePenalty per row closer than edge to the stratum's top or bottom, so they
 * round off inside it (like the Geode Depths' crystal caverns).
 */
export interface CavernSpec {
  stratum: number; // index into STRATA
  scaleX: number; // tiles per noise period
  scaleY: number;
  threshold: number;
  edge: number;
  edgePenalty: number;
}

/**
 * Cave systems (the strata profile v3, package B1): caves that show ore. Caverns in the Stone
 * Caverns and the Fungal Hollows, cave networks joining them in some areas, cave mouths at the
 * surface (the first near the spawn, leading to a first cavern with coal and copper on its
 * walls), and a share of every ore's veins started on a cave wall.
 */
export interface CaveSystemsSpec {
  caverns: readonly CavernSpec[];
  /**
   * Cave networks: winding passages along the zero line of a noise (|noise| < width), carved
   * `radius` tiles round, only where a slow region noise beats regionThreshold. The passages
   * narrow over the first regionFade above it, so a network peters out at its edges.
   */
  networks: {
    strata: readonly number[];
    scaleX: number;
    scaleY: number;
    width: number;
    radius: number;
    regionScale: number;
    regionThreshold: number;
    regionFade: number;
  };
  /**
   * Cave mouths: tunnels from the surface down into the caves, each heading away from the spawn,
   * between angleMin and angleMax degrees below horizontal (wandering by up to wobble a step),
   * about 2 * radius tiles across. The first starts nearMin..nearMax columns from the spawn and
   * ends in the first cavern; the others start anywhere at least `spacing` columns apart (and
   * from the first) and stop once they break into a cave of joinCave tiles, or at maxDepth.
   */
  mouths: {
    count: number;
    nearMin: number;
    nearMax: number;
    spacing: number;
    edgeMargin: number; // columns kept clear at the world's sides
    radius: number;
    angleMin: number;
    angleMax: number;
    wobble: number;
    minDepth: number; // m; a mouth only stops at a cave below this
    maxDepth: number; // m
    joinCave: number; // tiles
  };
  /**
   * The first cavern: a ragged ellipse (rx by ry tiles) at depthMin..depthMax m, at least
   * `cover` rows into the Stone Caverns, at the end of the first mouth. Its walls always show a
   * coal vein and a copper vein. The mouth is retried (up to `tries` times) until the cavern can
   * be walked to and back from the surface (world/walkable.ts).
   */
  firstCavern: {
    rxMin: number;
    rxMax: number;
    ryMin: number;
    ryMax: number;
    depthMin: number;
    depthMax: number;
    cover: number;
    tries: number;
  };
  /** Share of each ore's veins that start on a rock face (its stratum's rock with air on a side). */
  wallVeinShare: number;
}

export const CAVE_SYSTEMS: CaveSystemsSpec = {
  caverns: [
    { stratum: 1, scaleX: 120, scaleY: 30, threshold: 0.6, edge: 8, edgePenalty: 0.05 },
    { stratum: 2, scaleX: 100, scaleY: 30, threshold: 0.55, edge: 8, edgePenalty: 0.05 },
  ],
  networks: { strata: [1, 2], scaleX: 80, scaleY: 40, width: 0.025, radius: 1, regionScale: 160, regionThreshold: 0.15, regionFade: 0.25 },
  mouths: {
    count: 4,
    nearMin: 40,
    nearMax: 90,
    spacing: 120,
    edgeMargin: 40,
    radius: 1.8,
    angleMin: 20,
    angleMax: 55,
    wobble: 14,
    minDepth: 18,
    maxDepth: 70,
    joinCave: 300,
  },
  firstCavern: { rxMin: 20, rxMax: 28, ryMin: 6, ryMax: 9, depthMin: 28, depthMax: 40, cover: 3, tries: 12 },
  wallVeinShare: 0.3,
};

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
