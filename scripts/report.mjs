// Runs one of package B's measuring reports (src/analysis/reports.ts) from the command line:
//   npm run report:world -- --seeds 1,2,3,4,5
//   npm run report:backup -- r3-stone.json r3-copper.json
// The game's code is TypeScript that uses Vite's import.meta.env, so this loads it through Vite's
// own module loader (no extra tools). The report goes to stdout as markdown, progress to stderr.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createServer } from 'vite';

const [kind, ...args] = process.argv.slice(2);
if (kind !== 'world' && kind !== 'backup') {
  console.error('Usage: node scripts/report.mjs world [--seeds 1,2,3] | backup <file.json>...');
  process.exit(1);
}
if (kind === 'backup' && args.length === 0) {
  console.error('Give one or more backup files: npm run report:backup -- r3-stone.json r3-copper.json');
  process.exit(1);
}

/** A backup file's name and text, or nothing (with a note on stderr) if it can't be read. */
function readBackupFile(path) {
  try {
    return [{ name: basename(path), text: readFileSync(path, 'utf8') }];
  } catch (error) {
    console.error(`Skipping ${path}: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const reports = await server.ssrLoadModule('/src/analysis/reports.ts');
  const log = (line) => console.error(line);
  const text =
    kind === 'world'
      ? reports.runWorldReport(args, log)
      : reports.runBackupReport(args.flatMap(readBackupFile), log);
  console.log(text);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await server.close();
}
