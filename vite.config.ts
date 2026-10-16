/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { configDefaults } from 'vitest/config';

/** Dev-site builds (`--mode develop`) get their own page title and stay out of search results. */
function devSiteHtml(): Plugin {
  return {
    name: 'dev-site-html',
    transformIndexHtml(html) {
      return html
        .replace('<title>Dig Deep</title>', '<title>Dig Deep (dev)</title>')
        .replace('</head>', '  <meta name="robots" content="noindex" />\n  </head>');
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative asset paths, so the built dist/ works from any folder on any static host
  // (GitHub Pages project sites live under /<repo>/, itch.io serves from its own path).
  base: './',
  plugins: mode === 'develop' ? [devSiteHtml()] : [],
  // Claude Code keeps other checkouts of the repo in .claude/worktrees; test only this one.
  test: { exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'] },
}));
