import { readBackup } from '../systems/backup';
import { restoreProfile } from '../systems/save';
import { findProfile, generateWorld, NEW_WORLD_PROFILE, profileLabel, type GenProfile } from '../world/generate';
import type { World } from '../world/world';
import { backupReport, measureBackup, type BackupStats } from './backupStats';
import { findVeins, measureWorld, worldReport, type Veins } from './worldStats';

// The two package B reports, as run by scripts/report.mjs (which only reads files and prints):
//   npm run report:world -- --seeds 1,2,3,4,5 [--profile strata:2]
//   npm run report:backup -- r3-stone.json r3-copper.json
// Each returns its markdown; `log` gets progress lines (the script sends them to stderr).

export const DEFAULT_SEEDS = [1, 2, 3, 4, 5];

/** The value after `--name` (or in `--name=value`), or null. */
function option(args: readonly string[], name: string): string | null {
  const at = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (at < 0) return null;
  return args[at].includes('=') ? args[at].slice(args[at].indexOf('=') + 1) : (args[at + 1] ?? '');
}

/** The seeds from `--seeds 1,2,3` (or `--seeds=1,2,3`), or DEFAULT_SEEDS. */
export function parseSeeds(args: readonly string[]): number[] {
  const text = option(args, 'seeds');
  if (text === null) return DEFAULT_SEEDS;
  const seeds = text.split(',').map((s) => Number(s.trim()));
  if (seeds.length === 0 || seeds.some((s) => !Number.isSafeInteger(s) || s < 0)) {
    throw new Error(`--seeds needs whole numbers separated by commas, like --seeds 1,2,3 (got "${text}")`);
  }
  return seeds;
}

/** The profile from `--profile strata:2` (name and version), or the one new worlds get. */
export function parseProfile(args: readonly string[]): GenProfile {
  const text = option(args, 'profile');
  if (text === null) return NEW_WORLD_PROFILE;
  const [name, version] = text.split(':');
  const profile = findProfile({ name, version: Number(version) });
  if (!profile) throw new Error(`--profile needs a known profile and version, like --profile strata:2 (got "${text}")`);
  return profile;
}

/** Generate each seed with the profile new worlds get (or --profile's), and report on them. */
export function runWorldReport(args: readonly string[], log: (line: string) => void = () => {}): string {
  const profile = parseProfile(args);
  const stats = parseSeeds(args).map((seed) => {
    const start = performance.now();
    const world = generateWorld(seed, profile);
    const generated = performance.now();
    const measured = measureWorld(world);
    log(`seed ${seed}: generated in ${Math.round(generated - start)} ms, measured in ${Math.round(performance.now() - generated)} ms`);
    return measured;
  });
  return worldReport(stats);
}

/**
 * Read each backup file's text (checked as an import would be), regenerate its world from its
 * seed and profile (once per world), and report on them.
 */
export function runBackupReport(files: readonly { name: string; text: string }[], log: (line: string) => void = () => {}): string {
  const worlds = new Map<string, { world: World; veins: Veins }>();
  const stats: BackupStats[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const read = readBackup(file.text);
    if (read.kind !== 'ok') {
      problems.push(`- ${file.name}: ${read.reason}`);
      continue;
    }
    const save = read.save;
    const profile = restoreProfile(save);
    const key = `${save.seed}:${profileLabel(profile)}`;
    let generated = worlds.get(key);
    if (!generated) {
      log(`generating seed ${save.seed} (${profileLabel(profile)})`);
      const world = generateWorld(save.seed, profile);
      generated = { world, veins: findVeins(world) };
      worlds.set(key, generated);
    }
    stats.push(measureBackup(file.name, save, generated.world, generated.veins));
  }
  const report = backupReport(stats);
  return problems.length > 0 ? `${report}\n\n## Not read\n\n${problems.join('\n')}` : report;
}
