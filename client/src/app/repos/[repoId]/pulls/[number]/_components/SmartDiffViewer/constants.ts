/** Constants for SmartDiffViewer — role display metadata (label/subtitle/
    marker colour/default-open) for the three grouped diff sections. NOT the
    classification thresholds themselves (those live server-side in
    `server/src/modules/smart-diff/constants.ts` — this file only styles the
    already-classified groups the API returns). */
import type { PrFile, SmartDiffRole } from "@devdigest/shared";

export interface RoleMeta {
  label: string;
  subtitle: string;
  markerColor: string;
  /** Initial open/closed state for a file's FileCard in Smart order —
      overrides FileCard's own line-count heuristic. `undefined` defers to
      that heuristic (used for "Wiring" — small files expand, large collapse,
      per-file, same as the rest of the diff viewer). */
  defaultOpen: (file: PrFile) => boolean | undefined;
}

/** Fixed render order — core first (most important), boilerplate last. */
export const ROLE_ORDER: SmartDiffRole[] = ["core", "wiring", "boilerplate"];

export const ROLE_META: Record<SmartDiffRole, RoleMeta> = {
  core: {
    label: "Core logic",
    subtitle: "The substance of the change — review closely",
    markerColor: "var(--accent)",
    defaultOpen: () => true,
  },
  wiring: {
    label: "Wiring",
    subtitle: "Hooks the core into the app",
    markerColor: "var(--info)",
    defaultOpen: () => undefined,
  },
  boilerplate: {
    label: "Boilerplate",
    subtitle: "Generated / mechanical — skim",
    markerColor: "var(--text-muted)",
    defaultOpen: () => false,
  },
};
