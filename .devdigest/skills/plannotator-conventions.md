# backnotprop/plannotator-conventions

House conventions for `backnotprop/plannotator`. Flag changes that violate any rule below and cite the offending `file:line`.

## structure
Use a pluggable storage backend with a default cookie implementation, and allow overriding at startup via `setStorageBackend`.

Detected in `packages/ui/utils/storage.ts:23-55`:

```
const cookieBackend: StorageBackend = {
  getItem(key) {
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${escapeRegex(key)}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (e) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const encoded = encodeURIComponent(value);
      document.cookie = `${key}=${encoded}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    } catch (e) {
      // Cookie not available
    }
  },
  removeItem(key) {
    try {
      document.cookie = `${key}=; path=/; max-age=0`;
    } catch (e) {
      // Cookie not available
    }
  },
};

// Active backend. Defaults to cookies so Plannotator is unchanged. A host
// (e.g. Workspaces) calls setStorageBackend once at startup to persist settings
// through its own storage instead.
let backend: StorageBackend = cookieBackend;

/** Override the storage backend. Call once at app startup. */
export function setStorageBackend(b: StorageBackend): void {
  backend = b;
}
```

## error-handling
Validate shortcut registries at creation time using `createShortcutRegistry` to catch invalid bindings early and throw a descriptive error.

Detected in `packages/ui/shortcuts/core.ts:201-207`:

```
export function createShortcutRegistry<TRegistry extends ShortcutRegistry>(registry: TRegistry): TRegistry {
  const errors = validateShortcutRegistry(registry);
  if (errors.length > 0) {
    throw new Error(`Invalid shortcut registry:\n- ${errors.join('\n- ')}`);
  }
  return registry;
}
```

## structure
Use the `cn` utility (combining `clsx` and `twMerge`) for merging Tailwind class names with conflict resolution.

Detected in `packages/ui/lib/utils.ts:1-10`:

```
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind-aware conflict resolution.
 * `clsx` handles conditionals/arrays; `twMerge` dedupes conflicting utilities
 * (so a later `bg-*` wins over an earlier one, etc.).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## structure
Centralize platform detection in a single module (`platform.ts`) and import from there instead of inlining `navigator` checks.

Detected in `packages/ui/utils/platform.ts:1-11`:

```
/**
 * Platform detection for keyboard shortcut hints.
 *
 * Canonical source — import from here instead of inlining navigator checks.
 * Used across the plan editor, code review, and shared UI components.
 */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';
export const altKey = isMac ? '⌥' : 'Alt';
export const submitHint = isMac ? '⌘↵' : 'Ctrl+Enter';
export const isWindows = typeof navigator !== 'undefined' && /^Win/.test(navigator.platform);
```

## api-shape
Use `toRelativePath` to convert absolute file paths to repo-relative paths for diff compatibility, normalizing to forward slashes.

Detected in `packages/server/path-utils.ts:1-17`:

```
/**
 * Strip a cwd prefix from an absolute path to get a repo-relative path.
 * Used by review agent transforms to convert absolute file paths from
 * agent output into diff-compatible relative paths.
 *
 * Uses path.relative for cross-platform support (Windows backslashes)
 * and normalizes to forward slashes for git diff path matching.
 */
import { relative } from "node:path";

export function toRelativePath(absolutePath: string, cwd?: string): string {
  if (!cwd) return absolutePath;
  const rel = relative(cwd, absolutePath);
  // Don't relativize if the result goes outside cwd (different drive, symlink escape)
  if (rel.startsWith("..")) return absolutePath;
  // Normalize to forward slashes for diff path matching
  return rel.replace(/\\/g, "/");
}
```

## structure
Use `resolveMarkdownFile` and `resolveCodeFile` for smart file path resolution with case-insensitive fallback and multiple strategies (absolute, relative, bare filename search).

Detected in `packages/shared/resolve-file.ts:1-35`:

```
/**
 * Resolve a markdown file path within a project root.
 *
 * @param input - User-provided path (absolute, relative, or bare filename)
 * @param projectRoot - Project root directory to search within
 */
export function resolveMarkdownFile(
  input: string,
  projectRoot: string,
): ResolveResult {
  const originalInput = input.trim();
  const unquotedInput = stripWrappingQuotes(originalInput);

  const primary = resolveMarkdownFileCore(unquotedInput, projectRoot);
  if (primary.kind === "found") {
    return primary;
  }
  if (primary.kind === "ambiguous") {
    return { ...primary, input: originalInput };
  }

  if (!unquotedInput.startsWith("@")) {
    return { kind: "not_found", input: originalInput };
  }

  const normalizedInput = unquotedInput.replace(/^@+/, "");
  if (!normalizedInput) {
    return { kind: "not_found", input: originalInput };
  }

  const fallback = resolveMarkdownFileCore(normalizedInput, projectRoot);
  if (fallback.kind === "found") {
    return fallback;
  }
  if (fallback.kind === "ambiguous") {
    return { ...fallback, input: originalInput };
  }

  return { kind: "not_found", input: originalInput };
}
```