#!/usr/bin/env node
// Extracts hard facts about a multi-agent run from Claude Code's own transcripts.
// Reads ~/.claude/projects/<slug>/<session>.jsonl + <session>/subagents/*.jsonl.
// Emits a compact markdown report on stdout. Never writes anything.
//
// Usage:
//   node collect.mjs                 # newest session with >=1 subagent
//   node collect.mjs --session <id>  # a specific session
//   node collect.mjs --list          # list candidate sessions, newest first

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Per-MTok USD. Cache-write uses the 1h-TTL multiplier (2x) because Claude Code
// sessions run a 1-hour prompt cache; cache-read is 0.1x. Sonnet 5 list price is
// $3/$15 — introductory $2/$10 runs through 2026-08-31, so cost is an UPPER bound.
// Verify against the `claude-api` skill before trusting a number to the dollar.
const PRICES = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};
const CACHE_WRITE_MULT = 2.0; // 1h TTL
const CACHE_READ_MULT = 0.1;

const projectsDir = path.join(os.homedir(), '.claude', 'projects');
// Claude Code files transcripts under a slug that maps every non-alphanumeric
// character (including `_` and the drive colon) to `-`.
const slug = process.cwd().replace(/[^a-zA-Z0-9]/g, '-');

function sessionDir() {
  const exact = path.join(projectsDir, slug);
  if (fs.existsSync(exact)) return exact;
  // cwd may be a subdir of the project root the transcripts are filed under
  const all = fs.existsSync(projectsDir) ? fs.readdirSync(projectsDir) : [];
  const hit = all.filter((d) => slug.startsWith(d)).sort((a, b) => b.length - a.length)[0];
  if (!hit) throw new Error(`No transcripts found under ${projectsDir} for ${process.cwd()}`);
  return path.join(projectsDir, hit);
}

function readJsonl(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* partial write at tail */ }
  }
  return out;
}

function statsOf(rows) {
  const s = {
    turns: 0, in: 0, out: 0, cacheWrite: 0, cacheRead: 0,
    models: new Set(), tools: {}, reads: new Set(), edits: new Set(),
    t0: null, t1: null,
  };
  for (const r of rows) {
    if (r.timestamp) { s.t0 ??= r.timestamp; s.t1 = r.timestamp; }
    const m = r.message;
    if (!m) continue;
    const u = m.usage;
    if (u) {
      s.turns++;
      s.in += u.input_tokens || 0;
      s.out += u.output_tokens || 0;
      s.cacheWrite += u.cache_creation_input_tokens || 0;
      s.cacheRead += u.cache_read_input_tokens || 0;
      if (m.model) s.models.add(m.model);
    }
    if (!Array.isArray(m.content)) continue;
    for (const c of m.content) {
      if (c.type !== 'tool_use') continue;
      s.tools[c.name] = (s.tools[c.name] || 0) + 1;
      const p = c.input?.file_path;
      if (p && c.name === 'Read') s.reads.add(p);
      if (p && (c.name === 'Edit' || c.name === 'Write')) s.edits.add(p);
    }
  }
  return s;
}

const cost = (s) => {
  let total = 0;
  // A subagent is single-model in practice; attribute its whole spend to that model.
  const model = [...s.models][0];
  const p = PRICES[model];
  if (!p) return null;
  total += (s.in / 1e6) * p.in;
  total += (s.out / 1e6) * p.out;
  total += (s.cacheWrite / 1e6) * p.in * CACHE_WRITE_MULT;
  total += (s.cacheRead / 1e6) * p.in * CACHE_READ_MULT;
  return total;
};

const mins = (a, b) => (a && b ? ((new Date(b) - new Date(a)) / 6e4).toFixed(1) : '?');
const tok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n / 1e3) + 'K');
const hhmm = (t) => (t ? new Date(t).toISOString().slice(11, 16) : '??:??');
const toolStr = (t) => Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ') || '—';

// ---- locate the session -------------------------------------------------
const dir = sessionDir();
const args = process.argv.slice(2);
const wanted = args.includes('--session') ? args[args.indexOf('--session') + 1] : null;

const candidates = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.jsonl'))
  .map((f) => {
    const id = f.replace(/\.jsonl$/, '');
    const sub = path.join(dir, id, 'subagents');
    const metas = fs.existsSync(sub) ? fs.readdirSync(sub).filter((x) => x.endsWith('.meta.json')) : [];
    return { id, agents: metas.length, mtime: fs.statSync(path.join(dir, f)).mtimeMs };
  })
  .sort((a, b) => b.mtime - a.mtime);

if (args.includes('--list')) {
  for (const c of candidates.slice(0, 20)) {
    console.log(`${c.id}  agents=${String(c.agents).padStart(2)}  ${new Date(c.mtime).toISOString()}`);
  }
  process.exit(0);
}

const session = wanted
  ? candidates.find((c) => c.id.startsWith(wanted))
  : candidates.find((c) => c.agents > 0);

if (!session) {
  console.error('No session with subagents found. Try --list, or --session <id>.');
  process.exit(1);
}

// ---- parse --------------------------------------------------------------
const mainRows = readJsonl(path.join(dir, session.id + '.jsonl'));
const main = statsOf(mainRows);

// Cold spawns (Agent tool_use) and warm resumes (SendMessage tool_use), in order.
const spawns = new Map(); // toolUseId -> {description, subagent_type, at}
const resumes = []; // {to, summary, at}
const stopped = new Set(); // agent ids the orchestrator killed via TaskStop
for (const r of mainRows) {
  const m = r.message;
  if (!m || !Array.isArray(m.content)) continue;
  for (const c of m.content) {
    if (c.type !== 'tool_use') continue;
    if (c.name === 'Agent') {
      spawns.set(c.id, { type: c.input?.subagent_type ?? '?', desc: c.input?.description ?? '', at: r.timestamp });
    } else if (c.name === 'SendMessage') {
      resumes.push({ to: c.input?.to, summary: c.input?.summary ?? '', at: r.timestamp });
    } else if (c.name === 'TaskStop' && c.input?.task_id) {
      // TaskStop's task_id is the agent id (agent-<task_id>.jsonl). This is the
      // only signal a run was killed mid-flight — nothing lands in the meta.json.
      stopped.add(c.input.task_id);
    }
  }
}

const subDir = path.join(dir, session.id, 'subagents');
const agents = [];
if (fs.existsSync(subDir)) {
  for (const f of fs.readdirSync(subDir).filter((x) => x.endsWith('.meta.json'))) {
    const meta = JSON.parse(fs.readFileSync(path.join(subDir, f), 'utf8'));
    const id = f.replace(/^agent-|\.meta\.json$/g, '');
    const s = statsOf(readJsonl(path.join(subDir, f.replace('.meta.json', '.jsonl'))));
    agents.push({
      id, meta, s,
      resumes: resumes.filter((r) => r.to === id),
      spawnedAt: spawns.get(meta.toolUseId)?.at ?? s.t0,
      stopped: stopped.has(id),
    });
  }
}
agents.sort((a, b) => new Date(a.s.t0 || 0) - new Date(b.s.t0 || 0));

// ---- derived ------------------------------------------------------------
const allTok = (s) => s.in + s.out + s.cacheWrite + s.cacheRead;
const agentTok = agents.reduce((n, a) => n + allTok(a.s), 0);
const agentCost = agents.reduce((n, a) => n + (cost(a.s) || 0), 0);
const mainCost = cost(main) || 0;

// Parallelism: agents whose [t0,t1] windows overlap.
const waves = [];
for (const a of agents) {
  const w = waves.find((wv) =>
    wv.some((b) => new Date(a.s.t0) < new Date(b.s.t1) && new Date(b.s.t0) < new Date(a.s.t1)));
  if (w) w.push(a); else waves.push([a]);
}

// Files touched by more than one agent. A shared READ is duplicated cold-start
// cost. A shared WRITE means either a true collision (windows overlap — the
// plan's `Owns` lists were not disjoint) or a sequential hand-off (they don't —
// usually a cold re-spawn where a SendMessage to the owner would have done).
const rel = (p) => path.relative(process.cwd(), p).replace(/\\/g, '/');
const label = (a) => `#${agents.indexOf(a) + 1} ${a.meta.agentType}`;
const overlaps = (a, b) =>
  new Date(a.s.t0) < new Date(b.s.t1) && new Date(b.s.t0) < new Date(a.s.t1);

const readers = {}, writers = {};
for (const a of agents) {
  for (const p of a.s.reads) (readers[p] ??= new Set()).add(a);
  for (const p of a.s.edits) (writers[p] ??= new Set()).add(a);
}
const dupReads = Object.entries(readers).filter(([, v]) => v.size > 1)
  .sort((a, b) => b[1].size - a[1].size).slice(0, 12);
const dupWrites = Object.entries(writers).filter(([, v]) => v.size > 1)
  .map(([p, v]) => {
    const as = [...v];
    const concurrent = as.some((a, i) => as.slice(i + 1).some((b) => overlaps(a, b)));
    return { p, as, concurrent };
  });

// ---- report -------------------------------------------------------------
const L = [];
L.push(`# Run telemetry — session \`${session.id.slice(0, 8)}\``);
L.push('');
L.push(`Window: ${hhmm(main.t0)}–${hhmm(main.t1)} UTC (${mins(main.t0, main.t1)} min) · ${new Date(main.t0).toISOString().slice(0, 10)}`);
L.push(`Agents: ${agents.length} cold spawns, ${resumes.length} warm resumes (SendMessage)`);
L.push(`Tokens: ${tok(allTok(main) + agentTok)} total — orchestrator ${tok(allTok(main))}, subagents ${tok(agentTok)}`);
L.push(`Est. cost: $${(mainCost + agentCost).toFixed(2)} — orchestrator $${mainCost.toFixed(2)}, subagents $${agentCost.toFixed(2)}`);
L.push('');
L.push('## Agents, in spawn order');
L.push('');
L.push('| # | Agent | Model | Task | Start | Min | Turns | Tokens | Cost | Resumes | Tools |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
agents.forEach((a, i) => {
  const c = cost(a.s);
  L.push(`| ${i + 1} | ${a.meta.agentType}${a.stopped ? ' ⛔stopped' : ''} | ${[...a.s.models][0]?.replace('claude-', '') ?? '?'} | ${a.meta.description} | ${hhmm(a.s.t0)} | ${mins(a.s.t0, a.s.t1)} | ${a.s.turns} | ${tok(allTok(a.s))} | ${c ? '$' + c.toFixed(2) : '?'} | ${a.resumes.length || '—'} | ${toolStr(a.s.tools)} |`);
});
L.push('');
L.push('## Execution shape');
L.push('');
waves.forEach((w, i) => {
  const t0 = w.map((a) => a.s.t0).sort()[0];
  const t1 = w.map((a) => a.s.t1).sort().reverse()[0];
  L.push(`- **Wave ${i + 1}** (${hhmm(t0)}–${hhmm(t1)}, ${mins(t0, t1)} min${w.length > 1 ? `, ${w.length} in parallel` : ''}): ${w.map((a) => a.meta.agentType).join(', ')}`);
});
L.push('');
L.push(`Orchestrator's own tools: ${toolStr(main.tools)}`);
if (resumes.length) {
  L.push('');
  L.push('Warm resumes:');
  for (const r of resumes) {
    const a = agents.find((x) => x.id === r.to);
    L.push(`- → ${a ? a.meta.agentType : r.to} @ ${hhmm(r.at)}: ${r.summary}`);
  }
}
L.push('');
L.push('## Overlap');
L.push('');
const collisions = dupWrites.filter((d) => d.concurrent);
const handoffs = dupWrites.filter((d) => !d.concurrent);
if (collisions.length) {
  L.push('**⚠️ Concurrent writes — two agents wrote the same file while both were running.** File ownership did NOT hold; the plan\'s `Owns` lists overlapped:');
  for (const d of collisions) L.push(`- \`${rel(d.p)}\` — ${d.as.map(label).join(', ')}`);
  L.push('');
}
if (handoffs.length) {
  L.push('**Sequential hand-offs — same file, non-overlapping agents.** Not a collision, but each later agent paid a cold start to re-derive context the earlier one already had. Check whether a `SendMessage` to the owner would have done:');
  for (const d of handoffs) L.push(`- \`${rel(d.p)}\` — ${d.as.map(label).join(' → ')}`);
  L.push('');
}
if (!dupWrites.length) L.push('No file written by two agents — file ownership held.\n');
if (dupReads.length) {
  L.push(`**Files read by more than one agent** (top ${dupReads.length} — each re-read is duplicated cold-start cost):`);
  for (const [p, v] of dupReads) L.push(`- \`${rel(p)}\` — ${[...v].map(label).join(', ')}`);
} else {
  L.push('No file read by two agents.');
}
L.push('');
L.push(`_Cost is an estimate: list prices, 1h-TTL cache-write multiplier (${CACHE_WRITE_MULT}x). Sonnet 5 intro pricing may make it an over-estimate. Token counts are exact._`);

console.log(L.join('\n'));
