import { describe, it, expect } from 'vitest';
import { classifyPath, buildSmartDiff, type SmartDiffFileInput } from './classifier.js';
import { SPLIT_TOO_BIG_LINES } from './constants.js';

describe('classifyPath', () => {
  it('classifies lock-files and generated/build artifacts as boilerplate', () => {
    expect(classifyPath('pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyPath('package-lock.json')).toBe('boilerplate');
    expect(classifyPath('yarn.lock')).toBe('boilerplate');
    expect(classifyPath('bun.lock')).toBe('boilerplate');
    expect(classifyPath('bun.lockb')).toBe('boilerplate');
    expect(classifyPath('Cargo.lock')).toBe('boilerplate');
    expect(classifyPath('src/__snapshots__/Foo.test.ts.snap')).toBe('boilerplate');
    expect(classifyPath('dist/index.js')).toBe('boilerplate');
    expect(classifyPath('build/main.js')).toBe('boilerplate');
    expect(classifyPath('src/foo.min.js')).toBe('boilerplate');
    expect(classifyPath('src/foo.js.map')).toBe('boilerplate');
    expect(classifyPath('src/schema.generated.ts')).toBe('boilerplate');
  });

  it('classifies configs and barrels as wiring', () => {
    expect(classifyPath('vite.config.ts')).toBe('wiring');
    expect(classifyPath('tsconfig.json')).toBe('wiring');
    expect(classifyPath('tsconfig.build.json')).toBe('wiring');
    expect(classifyPath('src/modules/foo/index.ts')).toBe('wiring');
    expect(classifyPath('src/modules/foo/index.tsx')).toBe('wiring');
    expect(classifyPath('.env.local')).toBe('wiring');
    expect(classifyPath('Dockerfile')).toBe('wiring');
    expect(classifyPath('.github/workflows/ci.yml')).toBe('wiring');
    expect(classifyPath('docker-compose.yaml')).toBe('wiring');
    expect(classifyPath('src/modules/foo/routes.ts')).toBe('wiring');
  });

  it('classifies unmatched files as core', () => {
    expect(classifyPath('src/modules/foo/service.ts')).toBe('core');
    expect(classifyPath('src/modules/foo/helpers.ts')).toBe('core');
  });

  it('boilerplate patterns take precedence over wiring when both could match', () => {
    // ends with `.generated.ts` (boilerplate) AND contains `.config.` (wiring) — boilerplate wins.
    expect(classifyPath('schema.generated.config.ts')).toBe('boilerplate');
  });
});

describe('buildSmartDiff', () => {
  const files: SmartDiffFileInput[] = [
    { path: 'src/modules/foo/service.ts', additions: 50, deletions: 10 },
    { path: 'src/modules/foo/routes.ts', additions: 5, deletions: 1 },
    { path: 'pnpm-lock.yaml', additions: 300, deletions: 300 },
  ];

  it('groups files by role in fixed order [core, wiring, boilerplate]', () => {
    const result = buildSmartDiff(files, new Map());
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(result.groups[0]!.files[0]!.path).toBe('src/modules/foo/service.ts');
    expect(result.groups[1]!.files[0]!.path).toBe('src/modules/foo/routes.ts');
    expect(result.groups[2]!.files[0]!.path).toBe('pnpm-lock.yaml');
  });

  it('omits a role group entirely when it has no files', () => {
    const result = buildSmartDiff(
      [{ path: 'src/modules/foo/service.ts', additions: 1, deletions: 0 }],
      new Map(),
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.role).toBe('core');
  });

  it('maps finding_lines per file, deduped and sorted', () => {
    const findings = new Map([['src/modules/foo/service.ts', [10, 3, 3, 7]]]);
    const result = buildSmartDiff(files, findings);
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files[0]!.finding_lines).toEqual([3, 7, 10]);
    const wiring = result.groups.find((g) => g.role === 'wiring')!;
    expect(wiring.files[0]!.finding_lines).toEqual([]);
  });

  it('never sets pseudocode_summary (NO LLM call)', () => {
    const result = buildSmartDiff(files, new Map());
    for (const group of result.groups) {
      for (const file of group.files) {
        expect(file.pseudocode_summary).toBeNull();
      }
    }
  });

  it('too_big is true only when the PR is entangled (core + non-core) AND over threshold', () => {
    const entangledAndBig = buildSmartDiff(
      [
        { path: 'src/service.ts', additions: 300, deletions: 0 },
        { path: 'pnpm-lock.yaml', additions: 200, deletions: 0 },
      ],
      new Map(),
    );
    expect(entangledAndBig.split_suggestion.total_lines).toBe(500);
    expect(entangledAndBig.split_suggestion.too_big).toBe(true);
    expect(entangledAndBig.split_suggestion.proposed_splits).toEqual([
      { name: 'core', files: ['src/service.ts'] },
      { name: 'wiring & boilerplate', files: ['pnpm-lock.yaml'] },
    ]);

    const bigButNotEntangled = buildSmartDiff(
      [{ path: 'src/service.ts', additions: 500, deletions: 0 }],
      new Map(),
    );
    expect(bigButNotEntangled.split_suggestion.total_lines).toBe(500);
    expect(bigButNotEntangled.split_suggestion.too_big).toBe(false);
    expect(bigButNotEntangled.split_suggestion.proposed_splits).toEqual([]);

    const entangledButSmall = buildSmartDiff(
      [
        { path: 'src/service.ts', additions: 10, deletions: 0 },
        { path: 'pnpm-lock.yaml', additions: 5, deletions: 0 },
      ],
      new Map(),
    );
    expect(entangledButSmall.split_suggestion.too_big).toBe(false);
    expect(entangledButSmall.split_suggestion.proposed_splits).toEqual([]);
  });

  it('total_lines exactly at the threshold is not too_big (strictly greater than)', () => {
    const atThreshold = buildSmartDiff(
      [
        { path: 'src/service.ts', additions: SPLIT_TOO_BIG_LINES - 5, deletions: 0 },
        { path: 'pnpm-lock.yaml', additions: 5, deletions: 0 },
      ],
      new Map(),
    );
    expect(atThreshold.split_suggestion.total_lines).toBe(SPLIT_TOO_BIG_LINES);
    expect(atThreshold.split_suggestion.too_big).toBe(false);
  });
});
