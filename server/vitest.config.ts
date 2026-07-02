import { defineConfig } from 'vitest/config';

// Unit lane is hermetic (no Docker); integration tests use the *.it.test.ts
// suffix and are excluded via the CLI (`--exclude '**/*.it.test.ts'`).
// package.json is skip-worktree, so config lives here rather than in scripts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
