import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EvalBatchRun,
  EvalBatchResult,
  EvalCaseDraft,
  AgentEvalSummary,
  EvalDashboardHome,
  AgentEvalDashboard,
  EvalCompareMetric,
  EvalCompare,
  EvalPromoteInput,
} from '@devdigest/shared';

/**
 * T1 — Shared contracts (dual-vendor sync) + new Eval batch/dashboard/compare/
 * promote shapes. Hermetic: file-read + pure Zod parse, no I/O. AC-44.
 */
describe('eval-ci.ts dual-vendor sync (AC-44)', () => {
  it('server and client vendor copies are byte-identical', () => {
    const serverPath = resolve(__dirname, '../src/vendor/shared/contracts/eval-ci.ts');
    const clientPath = resolve(__dirname, '../../client/src/vendor/shared/contracts/eval-ci.ts');
    const serverContent = readFileSync(serverPath, 'utf8');
    const clientContent = readFileSync(clientPath, 'utf8');
    expect(clientContent).toBe(serverContent);
  });
});

describe('EvalBatchRun', () => {
  const valid = {
    id: 'batch-1',
    agent_id: 'agent-1',
    agent_name: 'Security Reviewer',
    agent_version: 7,
    status: 'done',
    ran_at: '2026-07-28T00:00:00.000Z',
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    traces_passed: 17,
    traces_total: 20,
    cost_usd: 0.23,
  };

  it('accepts a valid batch run row', () => {
    expect(() => EvalBatchRun.parse(valid)).not.toThrow();
  });

  it('rejects a row missing required agent_version', () => {
    const { agent_version: _omit, ...malformed } = valid;
    expect(() => EvalBatchRun.parse(malformed)).toThrow();
  });
});

describe('EvalCaseDraft', () => {
  const valid = {
    owner_kind: 'agent',
    owner_id: 'agent-1',
    name: 'hardcoded-stripe-secret-key',
    input_diff: '--- a/src/config.ts\n+++ b/src/config.ts',
    expected_output: [{ severity: 'CRITICAL', category: 'security', title: 'x', file: 'src/config.ts', start_line: 12 }],
  };

  it('accepts a valid draft (no id — it is not persisted)', () => {
    expect(() => EvalCaseDraft.parse(valid)).not.toThrow();
  });

  it('rejects a draft missing required owner_id', () => {
    const { owner_id: _omit, ...malformed } = valid;
    expect(() => EvalCaseDraft.parse(malformed)).toThrow();
  });
});

describe('EvalBatchResult', () => {
  it('accepts a batch + empty results array', () => {
    expect(() =>
      EvalBatchResult.parse({
        batch: {
          id: 'batch-1',
          agent_id: 'agent-1',
          agent_name: null,
          agent_version: 1,
          status: 'done',
          ran_at: '2026-07-28T00:00:00.000Z',
          recall: null,
          precision: null,
          citation_accuracy: null,
          traces_passed: 0,
          traces_total: 0,
          cost_usd: null,
        },
        results: [],
      }),
    ).not.toThrow();
  });

  it('rejects a result missing the required batch field', () => {
    expect(() => EvalBatchResult.parse({ results: [] })).toThrow();
  });
});

describe('AgentEvalSummary', () => {
  const valid = {
    agent_id: 'agent-1',
    agent_name: 'Security Reviewer',
    provider: 'openai',
    model: 'gpt-4.1',
    last_version: 7,
    last_ran_at: '2026-07-28T00:00:00.000Z',
    traces_passed: 17,
    traces_total: 20,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    sparkline: [0.7, 0.75, 0.82],
  };

  it('accepts a valid summary row', () => {
    expect(() => AgentEvalSummary.parse(valid)).not.toThrow();
  });

  it('rejects an invalid provider', () => {
    expect(() => AgentEvalSummary.parse({ ...valid, provider: 'not-a-provider' })).toThrow();
  });
});

describe('EvalDashboardHome', () => {
  it('accepts an empty dashboard home', () => {
    expect(() => EvalDashboardHome.parse({ agents: [], recent_runs: [] })).not.toThrow();
  });

  it('rejects a non-array agents field', () => {
    expect(() => EvalDashboardHome.parse({ agents: {}, recent_runs: [] })).toThrow();
  });
});

describe('AgentEvalDashboard', () => {
  const valid = {
    agent_id: 'agent-1',
    agent_name: 'Security Reviewer',
    provider: 'openai',
    model: 'gpt-4.1',
    current: {
      recall: 0.82,
      precision: 0.91,
      citation_accuracy: 0.95,
      traces_passed: 17,
      traces_total: 20,
      cost_usd: 0.23,
    },
    delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
    trend: [],
    recent_runs: [],
    running: false,
    alert: 'Precision dipped 2pts on v7 — a new false positive slipped in.',
  };

  it('accepts a valid agent eval dashboard', () => {
    expect(() => AgentEvalDashboard.parse(valid)).not.toThrow();
  });

  it('rejects a dashboard missing required current metrics', () => {
    const { current: _omit, ...malformed } = valid;
    expect(() => AgentEvalDashboard.parse(malformed)).toThrow();
  });
});

describe('EvalCompareMetric', () => {
  it('accepts old/new/delta all numbers or all null', () => {
    expect(() => EvalCompareMetric.parse({ old: 0.78, new: 0.82, delta: 0.04 })).not.toThrow();
    expect(() => EvalCompareMetric.parse({ old: null, new: null, delta: null })).not.toThrow();
  });

  it('rejects a metric missing the delta field', () => {
    expect(() => EvalCompareMetric.parse({ old: 0.78, new: 0.82 })).toThrow();
  });
});

describe('EvalCompare', () => {
  const batchRun = {
    id: 'batch-1',
    agent_id: 'agent-1',
    agent_name: 'Security Reviewer',
    agent_version: 6,
    status: 'done',
    ran_at: '2026-07-28T00:00:00.000Z',
    recall: 0.78,
    precision: 0.93,
    citation_accuracy: 0.94,
    traces_passed: 15,
    traces_total: 20,
    cost_usd: 0.21,
  };
  const metric = { old: 0.78, new: 0.82, delta: 0.04 };
  const valid = {
    a: batchRun,
    b: { ...batchRun, id: 'batch-2', agent_version: 7 },
    recall: metric,
    precision: metric,
    citation_accuracy: metric,
    cost: metric,
    old_config: null,
    new_config: null,
  };

  it('accepts a compare payload with null configs (degrades gracefully, AC-28)', () => {
    expect(() => EvalCompare.parse(valid)).not.toThrow();
  });

  it('rejects a compare payload missing the b batch run', () => {
    const { b: _omit, ...malformed } = valid;
    expect(() => EvalCompare.parse(malformed)).toThrow();
  });
});

describe('EvalPromoteInput', () => {
  it('accepts an integer version', () => {
    expect(() => EvalPromoteInput.parse({ version: 7 })).not.toThrow();
  });

  it('rejects a non-integer version', () => {
    expect(() => EvalPromoteInput.parse({ version: 7.5 })).toThrow();
  });

  it('rejects a missing version', () => {
    expect(() => EvalPromoteInput.parse({})).toThrow();
  });
});
