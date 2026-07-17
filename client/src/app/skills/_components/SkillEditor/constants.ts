import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. Evals/Stats are deliberately not part of this slice.
    NOTE: the "context" tab's label is NOT resolved via `t(labelKey)` under
    the `skills` namespace like the others — `messages/en/skills.json` is out
    of this task's file ownership, so `SkillEditor.tsx` renders a literal
    "Context" label for this one tab instead of adding a namespace lookup
    that existing SkillEditor tests (also unowned here) don't carry messages
    for. Its `labelKey` here is kept for shape consistency only and is not
    looked up directly. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
];

/** Tab keys accepted from `?tab=`; anything else falls back to Config. */
export const VALID_TABS: readonly string[] = TABS.map((t) => t.key);
