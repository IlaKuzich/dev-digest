import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars?.label ? `${key}:${vars.label}` : key,
}));
vi.mock("../../../lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));
vi.mock("../../../lib/theme", () => ({ useTheme: () => ({ theme: "dark", toggle: vi.fn() }) }));

import { useShellCommands } from "./useShellCommands";

describe("useShellCommands", () => {
  it("excludes disabled nav placeholders (Memory / Multi-Agent Review / Agent Performance) from the command palette", () => {
    const { result } = renderHook(() => useShellCommands());
    const ids = result.current.map((c) => c.id);
    expect(ids).toContain("ci-runs");
    expect(ids).not.toContain("memory");
    expect(ids).not.toContain("multi-agent-review");
    expect(ids).not.toContain("agent-performance");
  });
});
