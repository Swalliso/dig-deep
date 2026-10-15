import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built dist/ works from any folder on any static host
  // (GitHub Pages project sites live under /<repo>/, itch.io serves from its own path).
  base: './',
});
