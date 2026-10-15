// Which build this is: the live site (main, `npm run build`) or the dev site (develop,
// `npm run build:dev`, served from /dig-deep/dev/). Both sites are on the swalliso.github.io
// origin, so they share IndexedDB and localStorage: every storage key goes through
// storageKey() so a dev build can never read or overwrite a live save.

export type Channel = 'live' | 'dev';

export const CHANNEL: Channel = import.meta.env.MODE === 'develop' ? 'dev' : 'live';

/** Short commit hash for CI builds (CI sets VITE_COMMIT), or '' for local builds. */
export const BUILD_SHA = String(import.meta.env.VITE_COMMIT ?? '').slice(0, 7);

/** Storage key for `name` on a channel. Live keys must never change, or players lose their saves. */
export function storageKey(name: string, channel: Channel = CHANNEL): string {
  return `${channel === 'dev' ? 'dig-deep-dev' : 'dig-deep'}:${name}`;
}
