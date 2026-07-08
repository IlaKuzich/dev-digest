import { describe, it, expect } from "vitest";
import { buildDefaultSkillBody, repoSlug } from "./helpers";
import type { ConventionCandidate } from "@devdigest/shared";

const base: ConventionCandidate = {
  id: "c1",
  scan_id: "s1",
  category: "naming",
  rule: "Use async/await instead of .then() chains",
  edited_rule: null,
  evidence_path: "src/api/users.ts",
  evidence_line_start: 23,
  evidence_line_end: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "accepted",
  skill_id: null,
  created_at: "2026-07-08T00:00:00.000Z",
};

describe("buildDefaultSkillBody", () => {
  it("renders heading, intro, and one section per rule with file:line + snippet", () => {
    const body = buildDefaultSkillBody("acme/payments-api", [base]);
    expect(body).toContain("# acme/payments-api-conventions");
    expect(body).toContain("House conventions for `acme/payments-api`");
    expect(body).toContain("Use async/await instead of .then() chains");
    expect(body).toContain("`src/api/users.ts:23-31`");
    expect(body).toContain("const user = await db.users.find(id);");
  });

  it("prefers edited_rule over rule", () => {
    const body = buildDefaultSkillBody("r", [{ ...base, edited_rule: "EDITED" }]);
    expect(body).toContain("EDITED");
    expect(body).not.toContain("Use async/await instead");
  });
});

describe("repoSlug", () => {
  it("takes the last path segment", () => {
    expect(repoSlug("acme/payments-api")).toBe("payments-api");
    expect(repoSlug("solo")).toBe("solo");
  });
});
