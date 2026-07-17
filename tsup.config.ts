import { defineConfig } from 'tsup';

/**
 * We ship a single bundled dist/index.js (compiled JS, not a raw tsc
 * output tree) rather than requiring consumers to run a build step
 * themselves — see README "Packaging: compiled JS, not a build-from-source
 * requirement" for the reasoning. tsup detects the `#!/usr/bin/env node`
 * shebang already present in src/index.ts, keeps it at the top of the
 * bundle, and marks the output file executable, which is what makes
 * `pnpm dlx agent-locks` able to run it directly as the package's `bin`.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  clean: true,
  dts: false,
  sourcemap: false,
  splitting: false,
  shims: false,
  minify: false,
  noExternal: [],
});
