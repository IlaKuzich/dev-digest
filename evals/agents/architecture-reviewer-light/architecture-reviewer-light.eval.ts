import { describeAgent, runAgentCases } from "../../src/index.js";
import { cases } from "../architecture-reviewer/architecture-reviewer.cases.js";

// Reuses the exact same cases/fixtures as evals/agents/architecture-reviewer — this is an
// A/B comparison against a modified agent definition (.claude/agents/architecture-reviewer-light.md),
// not a new set of scenarios. Keep it that way so results are directly comparable.
describeAgent("architecture-reviewer-light", () => runAgentCases("architecture-reviewer-light", cases));
