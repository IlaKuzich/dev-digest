# Skills — Core Loop (Slice A + B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make skills a first-class, usable feature: authored via a new Skills page (DB source of truth), bound to an agent with per-agent enable/disable + ordering on a new Agent editor "Skills" tab, and actually injected into the review prompt so a linked skill changes a real review and is visible in the run trace.

**Architecture:** Server: a new onion-layered `skills` module (routes → service → repository) parallel to the existing `agents` module; `AgentsRepository` gains an `enabled` bit on `agent_skills` plus an `enabledSkillsForAgent` read used by `run-executor.ts` to resolve + label skill bodies before calling reviewer-core's already-existing `reviewPullRequest({ skills })`. Client: a new `/skills` list+editor mirroring the `/agents` page, plus a new `SkillsTab` in the Agent editor that merges all workspace skills with the agent's saved links into one draggable, checkbox-driven list.

**Tech Stack:** Fastify 5 + Drizzle/Postgres (server), Next.js 15 + React 19 + TanStack Query (client), Zod 3 contracts in `@devdigest/shared` (vendored into both consumers), reviewer-core (unchanged — already accepts `skills: string[]`).

## Global Constraints

- Node ≥22 · pnpm ≥10 · TypeScript 5.7 everywhere · Zod 3 contracts.
- NOT a workspace — server/client have independent lockfiles; no pnpm-workspace/turbo/nx.
- `@devdigest/shared` is vendored into `server/src/vendor/shared/` and `client/src/vendor/shared/` — every contract edit must be applied **identically to both copies in the same task** (no automated sync exists; a mismatch causes runtime Zod parse failures).
- `reviewer-core` is consumed as TypeScript source and needs **no changes** — `assemblePrompt`/`reviewPullRequest` already accept and render `skills: string[]`.
- Server: don't edit existing schema files except the one approved deviation this spec calls out (`server/src/db/schema/agents.ts`, adding a column to `agent_skills`); every other new table/column goes in new files. Never hand-write a migration `.sql` without a matching `_journal.json` entry — always run `pnpm db:generate` so Drizzle writes both.
- Server: routes declare Zod `params`/`body` (no hand-rolled `req.body` parsing); services receive the `Container`, never instantiate adapters directly; tests ending in `*.it.test.ts` are Postgres-backed (testcontainers) and self-skip without Docker — everything else must be hermetic.
- Client: all server state goes through TanStack Query hooks in `src/lib/hooks/*` via `src/lib/api.ts` — never `fetch` from a component; page-local code lives in `_components/<Name>/` next to the route; don't reach into `src/vendor/ui/` component internals (the one approved exception here is `src/vendor/ui/nav.ts`, a plain data registry already extended once before for `/agents`, not a sealed component).
- Testing split per `TESTING.md`: hermetic unit tests exclude `*.it.test.ts`; DB-backed tests use that suffix and `test/helpers/pg.ts`.

---

### Task 1: Schema — `agent_skills.enabled` column + migration

**Files:**
- Modify: `server/src/db/schema/agents.ts:51-63` (the `agentSkills` table def)
- Generate: `server/src/db/migrations/00XX_<generated>.sql` + `server/src/db/migrations/meta/_journal.json` (via `pnpm db:generate` — do not hand-write)

**Interfaces:**
- Produces: `agentSkills.enabled: boolean` (Drizzle column, default `true`), consumed by Task 5's `AgentsRepository.linkedSkills`/`setSkills`/`enabledSkillsForAgent`.

- [ ] **Step 1: Add the column to the schema**

Edit `server/src/db/schema/agents.ts`, the `agentSkills` table:

```ts
export const agentSkills = pgTable(
  'agent_skills',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => ({ pk: primaryKey({ columns: [t.agentId, t.skillId] }) }),
);
```

(Only the added `enabled: boolean('enabled').notNull().default(true),` line changes.)

- [ ] **Step 2: Generate the migration**

Run: `cd server && pnpm db:generate`

Expected: a new file `server/src/db/migrations/00XX_<random-name>.sql` appears whose content is (or is equivalent to):

```sql
ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;
```

and `server/src/db/migrations/meta/_journal.json` gains a new entry for that tag (idx = previous + 1, `version: "7"`, `breakpoints: true`). Confirm both by reading the new `.sql` file and the tail of `_journal.json`.

- [ ] **Step 3: Apply it to your local dev DB (optional sanity check)**

Run: `cd server && pnpm db:migrate`

Expected: exits 0; no error about missing/duplicate columns.

- [ ] **Step 4: Commit**

```bash
git add server/src/db/schema/agents.ts server/src/db/migrations/
git commit -m "feat(schema): add agent_skills.enabled for per-agent skill toggle"
```

---

### Task 2: Contracts — `AgentSkillLink.enabled`, `CreateSkillInput`, `UpdateSkillInput`

**Files:**
- Modify: `server/src/vendor/shared/contracts/knowledge.ts` (canonical)
- Modify: `client/src/vendor/shared/contracts/knowledge.ts` (mirror — identical contract edits)
- Test: `server/src/vendor/shared/contracts/knowledge.test.ts` (new — hermetic Zod parse test)

**Interfaces:**
- Consumes: existing `Skill`, `SkillType` (`z.enum(['rubric','convention','security','custom'])`) already in `knowledge.ts`.
- Produces: `AgentSkillLink` now includes `enabled: boolean` (used by Task 5/9); `CreateSkillInput`/`UpdateSkillInput` (used by Task 3's routes and Task 8's client hooks).

- [ ] **Step 1: Edit the canonical copy**

In `server/src/vendor/shared/contracts/knowledge.ts`, change the `AgentSkillLink` block (currently at line 194-199):

```ts
export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  enabled: z.boolean(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
```

Immediately after the `Skill`/`CommunitySkill` block (after line 141, before `// ---- Conventions ----`), add:

```ts
export const CreateSkillInput = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  body: z.string(),
});
export type CreateSkillInput = z.infer<typeof CreateSkillInput>;

export const UpdateSkillInput = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateSkillInput = z.infer<typeof UpdateSkillInput>;
```

- [ ] **Step 2: Apply the identical edit to the client's vendored copy**

Make the exact same two edits in `client/src/vendor/shared/contracts/knowledge.ts` (the `AgentSkillLink` schema there is at line ~190; the `Skill`/`CommunitySkill` block precedes `// ---- Conventions ----` there too). Confirm both files' `AgentSkillLink`, `CreateSkillInput`, `UpdateSkillInput` blocks are byte-identical (ignoring surrounding comments) via `diff`.

- [ ] **Step 3: Write a hermetic parse test**

Create `server/src/vendor/shared/contracts/knowledge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AgentSkillLink, CreateSkillInput, UpdateSkillInput } from './knowledge.js';

describe('skills contracts', () => {
  it('AgentSkillLink requires enabled', () => {
    expect(() => AgentSkillLink.parse({ agent_id: 'a', skill_id: 's', order: 0 })).toThrow();
    expect(
      AgentSkillLink.parse({ agent_id: 'a', skill_id: 's', order: 0, enabled: true }),
    ).toEqual({ agent_id: 'a', skill_id: 's', order: 0, enabled: true });
  });

  it('CreateSkillInput requires name/description/type/body', () => {
    expect(() => CreateSkillInput.parse({ name: 'x' })).toThrow();
    expect(
      CreateSkillInput.parse({ name: 'x', description: 'd', type: 'convention', body: '# r' }),
    ).toMatchObject({ name: 'x', type: 'convention' });
  });

  it('UpdateSkillInput is fully optional, including enabled', () => {
    expect(UpdateSkillInput.parse({})).toEqual({});
    expect(UpdateSkillInput.parse({ enabled: false })).toEqual({ enabled: false });
  });
});
```

- [ ] **Step 4: Run it**

Run: `cd server && pnpm exec vitest run src/vendor/shared/contracts/knowledge.test.ts`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/vendor/shared/contracts/knowledge.ts server/src/vendor/shared/contracts/knowledge.test.ts client/src/vendor/shared/contracts/knowledge.ts
git commit -m "feat(shared): add AgentSkillLink.enabled + CreateSkillInput/UpdateSkillInput"
```

---

### Task 3: Server — `skills` module (repository, service, routes) + `db/rows.ts`

**Files:**
- Modify: `server/src/db/rows.ts` (add `SkillRow`, `SkillVersionRow`)
- Create: `server/src/modules/skills/repository.ts`
- Create: `server/src/modules/skills/helpers.ts`
- Create: `server/src/modules/skills/service.ts`
- Create: `server/src/modules/skills/routes.ts`
- Modify: `server/src/modules/index.ts` (register the module)
- Test: `server/src/modules/skills/helpers.test.ts` (hermetic unit — the module's one DB-free piece of logic)

**Interfaces:**
- Consumes: `t.skills`, `t.skillVersions` (`server/src/db/schema/skills.ts`, unchanged), `Skill`/`SkillType`/`SkillSource`/`CreateSkillInput`/`UpdateSkillInput` from `@devdigest/shared` (Task 2).
- Produces: `SkillsService` with `list/get/create/update/delete(workspaceId, ...)` returning `Skill` DTOs — consumed only within this module's routes (no other module needs `SkillsRepository` directly, so it is **not** added to the DI container, matching how e.g. `PullsService` builds its own repo).

- [ ] **Step 1: Add row types**

In `server/src/db/rows.ts`, add after the existing exports:

```ts
export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;
```

- [ ] **Step 2: Write the repository**

Create `server/src/modules/skills/repository.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

/**
 * A1 — skills data-access. Owns `skills` + `skill_versions`. Workspace-scoped
 * throughout; the `agent_skills` link table is owned by A2's AgentsRepository.
 */

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: 'manual',
        body: values.body,
        version: 1,
      })
      .returning();
    return row!;
  }

  /**
   * Update a skill. Editing `body` bumps `version` and snapshots the PRIOR
   * body + version number into `skill_versions` (parity with agent
   * versioning). Metadata-only or `enabled`-only changes do not bump version.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    if (bodyChanged) {
      await this.db.insert(t.skillVersions).values({
        skillId: existing.id,
        version: existing.version,
        body: existing.body,
      });
    }

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();
    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }
}
```

- [ ] **Step 3: Write the DTO mapper**

Create `server/src/modules/skills/helpers.ts`:

```ts
import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow } from './repository.js';

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}
```

- [ ] **Step 4: Write the service**

Create `server/src/modules/skills/service.ts`:

```ts
import type { Container } from '../../platform/container.js';
import type { CreateSkillInput, Skill, UpdateSkillInput } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto } from './helpers.js';

/** A1 — skills service. CRUD backing the Skills page + Agent editor Skills tab. */
export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }
}
```

- [ ] **Step 5: Write the routes**

Create `server/src/modules/skills/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateSkillInput, UpdateSkillInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * A1 — skills module.
 *   GET    /skills       → list (workspace-scoped)
 *   GET    /skills/:id   → one skill
 *   POST   /skills       → create (source: 'manual', version: 1)
 *   PUT    /skills/:id   → update (body/metadata and/or enabled toggle)
 *   DELETE /skills/:id   → delete (cascades agent_skills rows + skill_versions)
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });
}
```

- [ ] **Step 6: Register the module**

In `server/src/modules/index.ts`, add the import and registry entry:

```ts
import skills from './skills/routes.js';
```

(alongside the other imports), and add `skills,` to the `modules` object (e.g. right after `agents,`).

- [ ] **Step 7: Write the hermetic unit test**

`SkillsService` (like `AgentsService`) constructs its repository internally from `container.db` rather than accepting it as a constructor param, so it has no DB-free seam to unit-test — its behavior is covered by Task 4's integration test instead, matching how `AgentsService` has no unit test of its own. The one piece of DB-free logic this module owns is the DTO mapper; test that directly.

Create `server/src/modules/skills/helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toSkillDto } from './helpers.js';
import type { SkillRow } from './repository.js';

const row: SkillRow = {
  id: 'sk-1',
  workspaceId: 'ws-1',
  name: 'PR quality rubric',
  description: 'Checks structure',
  type: 'rubric',
  source: 'manual',
  body: '# Rule\ncite lines',
  enabled: true,
  version: 1,
  evidenceFiles: null,
  createdAt: new Date(),
};

describe('toSkillDto', () => {
  it('maps a persisted row to the Skill DTO', () => {
    expect(toSkillDto(row)).toEqual({
      id: 'sk-1',
      name: 'PR quality rubric',
      description: 'Checks structure',
      type: 'rubric',
      source: 'manual',
      body: '# Rule\ncite lines',
      enabled: true,
      version: 1,
      evidence_files: null,
    });
  });

  it('defaults a null evidence_files to null (not undefined)', () => {
    expect(toSkillDto({ ...row, evidenceFiles: null }).evidence_files).toBeNull();
  });
});
```

- [ ] **Step 8: Run it**

Run: `cd server && pnpm exec vitest run src/modules/skills/helpers.test.ts`
Expected: 2 passing tests.

- [ ] **Step 9: Typecheck + commit**

Run: `cd server && pnpm typecheck`
Expected: no errors.

```bash
git add server/src/db/rows.ts server/src/modules/skills server/src/modules/index.ts
git commit -m "feat(server): add skills module (CRUD, version-on-body-edit)"
```

---

### Task 4: Server — skills integration test (`*.it.test.ts`)

**Files:**
- Create: `server/test/skills.it.test.ts`

**Interfaces:**
- Consumes: `buildApp` (`server/src/app.ts`), `startPg`/`dockerAvailable` (`server/test/helpers/pg.ts`), the routes from Task 3.

- [ ] **Step 1: Write the integration test**

Create `server/test/skills.it.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

d('Skills CRUD', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Security rubric',
    description: 'Flags secrets and injection',
    type: 'security' as const,
    body: '# Rule\nFlag any hardcoded credential.',
  };

  it('creates a skill as manual/v1 and lists it', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ ...createBody, source: 'manual', version: 1, enabled: true });

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.json().map((s: { name: string }) => s.name)).toContain('Security rubric');
    await app.close();
  });

  it('editing body bumps version and snapshots the prior body into skill_versions', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Rule v2\nFlag any hardcoded credential or secret.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);
    expect(updated.json().body).toContain('v2');
    await app.close();
  });

  it('metadata-only or enabled-only edits do NOT bump version', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;

    const meta = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { description: 'new desc' } });
    expect(meta.json().version).toBe(1);

    const toggled = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { enabled: false } });
    expect(toggled.json().version).toBe(1);
    expect(toggled.json().enabled).toBe(false);
    await app.close();
  });

  it('deletes a skill; 404s afterward', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;

    const del = await app.inject({ method: 'DELETE', url: `/skills/${id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('rejects an incomplete create body with 422', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: { name: 'x' } });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
```

- [ ] **Step 2: Run it (requires Docker)**

Run: `cd server && pnpm exec vitest run .it.test -t "Skills CRUD"`
Expected: 5 passing tests (or a skip notice if Docker is unavailable).

- [ ] **Step 3: Commit**

```bash
git add server/test/skills.it.test.ts
git commit -m "test(server): skills CRUD + version-bump-on-body-edit integration coverage"
```

---

### Task 5: Server — extend `AgentsRepository`/service/routes for per-agent `enabled` + `enabledSkillsForAgent`

**Files:**
- Modify: `server/src/modules/agents/repository.ts:45-49,192-235` (`LinkedSkillRow`, `linkedSkills`, `setSkills`; remove `linkSkill`/`unlinkSkill`; add `enabledSkillsForAgent`)
- Modify: `server/src/modules/agents/service.ts:138-172` (`skillLinks`, `setSkills`; remove `linkSkill`)
- Modify: `server/src/modules/agents/routes.ts:59-68,152-165` (`SetSkillsBody`, the `POST /agents/:id/skills` handler)

**Interfaces:**
- Consumes: `agentSkills.enabled` (Task 1), `AgentSkillLink` with `enabled` (Task 2).
- Produces: `AgentsRepository.enabledSkillsForAgent(agentId): Promise<{ name: string; body: string }[]>` — consumed by Task 7's `run-executor.ts`. `AgentsService.setSkills(workspaceId, agentId, links: { skill_id: string; enabled: boolean }[])` — consumed by Task 11's client `useSetAgentSkills`.

- [ ] **Step 1: Repository — `LinkedSkillRow`, `linkedSkills`, `setSkills`, `enabledSkillsForAgent`; drop `linkSkill`/`unlinkSkill`**

In `server/src/modules/agents/repository.ts`, replace the `LinkedSkillRow` interface (line 45-49):

```ts
/** A skill linked to an agent (with its order + per-agent enabled bit), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
  enabled: boolean;
}

/** One entry of the ordered set POSTed by the Agent editor's Skills tab. */
export interface AgentSkillLinkInput {
  skillId: string;
  enabled: boolean;
}
```

Replace the `// ---- agent_skills link table ----` section (lines 189-235) with:

```ts
  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending, with each row's `enabled` bit. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order, enabled: t.agentSkills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order, enabled: r.enabled }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /**
   * Replace the full set of linked skills for an agent with `links`, assigning
   * order = array index and carrying each row's `enabled` bit. Used by the
   * Skills editor tab, which always sends the whole ordered set (no partial
   * link/unlink API — skills not in the list are simply dropped).
   */
  async setSkills(agentId: string, links: AgentSkillLinkInput[]): Promise<void> {
    await this.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    if (links.length === 0) return;
    await this.db.insert(t.agentSkills).values(
      links.map((l, i) => ({ agentId, skillId: l.skillId, order: i, enabled: l.enabled })),
    );
  }

  /**
   * Skills to inject into this agent's next review prompt: BOTH the global
   * skill toggle (`skills.enabled`) and the per-agent toggle
   * (`agent_skills.enabled`) must be on. Ordered by `agent_skills.order` —
   * drives the assembled prompt's "## Skills / rules" ordering.
   */
  async enabledSkillsForAgent(agentId: string): Promise<{ name: string; body: string }[]> {
    return this.db
      .select({ name: t.skills.name, body: t.skills.body })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
  }
```

(`linkSkill`/`unlinkSkill` are deleted — grep confirms no other module calls them.)

- [ ] **Step 2: Service — `skillLinks`, `setSkills`; drop `linkSkill`**

In `server/src/modules/agents/service.ts`, replace `skillLinks`/`setSkills`/`linkSkill` (lines 138-172) with:

```ts
  /** Linked skills for an agent as AgentSkillLink[] (ordered). */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({
      agent_id: agentId,
      skill_id: l.skill.id,
      order: l.order,
      enabled: l.enabled,
    }));
  }

  /**
   * Replace the agent's linked skills with the given ordered set (each entry
   * carrying its per-agent `enabled` bit). Returns the resulting ordered links.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    links: { skill_id: string; enabled: boolean }[],
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.repo.setSkills(
      agentId,
      links.map((l) => ({ skillId: l.skill_id, enabled: l.enabled })),
    );
    return this.skillLinks(agentId);
  }
```

- [ ] **Step 3: Routes — replace `SetSkillsBody` and the `POST /agents/:id/skills` handler**

In `server/src/modules/agents/routes.ts`, replace the `SetSkillsBody` schema (lines 59-68):

```ts
/** The Skills tab always sends the whole ordered set. */
const SetSkillsBody = z.object({
  links: z.array(z.object({ skill_id: z.string().uuid(), enabled: z.boolean() })),
});
```

Replace the `POST /agents/:id/skills` handler (lines 152-165):

```ts
  app.post(
    '/agents/:id/skills',
    { schema: { params: IdParams, body: SetSkillsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.setSkills(workspaceId, req.params.id, req.body.links);
      if (!links) throw new NotFoundError('Agent not found');
      return links;
    },
  );
```

Update the route-list comment above (`POST /agents/:id/skills → set/reorder linked skills OR link one`) to: `POST /agents/:id/skills → set/reorder the full linked-skills set (with enabled)`.

- [ ] **Step 4: Typecheck**

Run: `cd server && pnpm typecheck`
Expected: no errors (confirms nothing else referenced the removed `linkSkill`/`unlinkSkill`/`skill_ids`/`skill_id` shape — already verified by grep during planning).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/agents/repository.ts server/src/modules/agents/service.ts server/src/modules/agents/routes.ts
git commit -m "feat(agents): per-agent skill enabled bit + enabledSkillsForAgent gate"
```

---

### Task 6: Server — agent-skills integration test (`*.it.test.ts`)

**Files:**
- Create: `server/test/agent-skills.it.test.ts`

**Interfaces:**
- Consumes: `POST/GET /agents/:id/skills` (Task 5), `POST /skills` (Task 3), `AgentsRepository.enabledSkillsForAgent` (Task 5).

- [ ] **Step 1: Write the integration test**

Create `server/test/agent-skills.it.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-skills] Docker not available — skipping integration tests.');
}

d('Agent skill links — enabled + ordering', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function makeAgentAndSkills(app: Awaited<ReturnType<typeof makeApp>>) {
    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Reviewer', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      })
    ).json().id as string;
    const skillA = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'A', description: 'd', type: 'convention', body: 'body-a' },
      })
    ).json();
    const skillB = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'B', description: 'd', type: 'security', body: 'body-b' },
      })
    ).json();
    return { agentId, skillA, skillB };
  }

  it('POST sets the ordered links; GET round-trips enabled + order', async () => {
    const app = await makeApp();
    const { agentId, skillA, skillB } = await makeAgentAndSkills(app);

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        links: [
          { skill_id: skillB.id, enabled: true },
          { skill_id: skillA.id, enabled: false },
        ],
      },
    });
    expect(set.statusCode).toBe(200);

    const get = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(get).toEqual([
      { agent_id: agentId, skill_id: skillB.id, order: 0, enabled: true },
      { agent_id: agentId, skill_id: skillA.id, order: 1, enabled: false },
    ]);
    await app.close();
  });

  it('enabledSkillsForAgent requires BOTH the per-agent AND the global toggle, ordered', async () => {
    const app = await makeApp();
    const { agentId, skillA, skillB } = await makeAgentAndSkills(app);

    // A: per-agent enabled, global enabled → included.
    // B: per-agent enabled, but globally disabled → excluded.
    await app.inject({ method: 'PUT', url: `/skills/${skillB.id}`, payload: { enabled: false } });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        links: [
          { skill_id: skillA.id, enabled: true },
          { skill_id: skillB.id, enabled: true },
        ],
      },
    });

    const repo = new AgentsRepository(pg.handle.db);
    const enabled = await repo.enabledSkillsForAgent(agentId);
    expect(enabled).toEqual([{ name: 'A', body: 'body-a' }]);
    await app.close();
  });

  it('a per-agent-disabled skill is excluded even when globally enabled', async () => {
    const app = await makeApp();
    const { agentId, skillA } = await makeAgentAndSkills(app);

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { links: [{ skill_id: skillA.id, enabled: false }] },
    });

    const repo = new AgentsRepository(pg.handle.db);
    expect(await repo.enabledSkillsForAgent(agentId)).toEqual([]);
    await app.close();
  });

  it('re-POSTing a smaller set drops skills no longer included', async () => {
    const app = await makeApp();
    const { agentId, skillA, skillB } = await makeAgentAndSkills(app);

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        links: [
          { skill_id: skillA.id, enabled: true },
          { skill_id: skillB.id, enabled: true },
        ],
      },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { links: [{ skill_id: skillA.id, enabled: true }] },
    });

    const get = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(get).toHaveLength(1);
    expect(get[0].skill_id).toBe(skillA.id);
    await app.close();
  });
});
```

- [ ] **Step 2: Run it (requires Docker)**

Run: `cd server && pnpm exec vitest run .it.test -t "Agent skill links"`
Expected: 4 passing tests (or a skip notice without Docker).

- [ ] **Step 3: Commit**

```bash
git add server/test/agent-skills.it.test.ts
git commit -m "test(server): agent skill-link enabled round-trip + two-level gate"
```

---

### Task 7: Server — wire `run-executor.ts` to inject enabled skills into the prompt

**Files:**
- Modify: `server/src/modules/reviews/helpers.ts` (add a pure formatter)
- Modify: `server/src/modules/reviews/run-executor.ts:191-213` (the `reviewPullRequest` call site)
- Test: `server/src/modules/reviews/helpers.test.ts` (new — hermetic, pure function)
- Test: `server/src/modules/reviews/run-executor.test.ts` (new — hermetic, mocked LLM/agentsRepo/repo)

**Interfaces:**
- Consumes: `AgentsRepository.enabledSkillsForAgent` (Task 5), `reviewPullRequest({ skills })` (already exists, unchanged — `reviewer-core/src/review/run.ts:56`).
- Produces: `formatSkillsForPrompt(rows): string[]` (pure, reusable/testable in isolation).

- [ ] **Step 1: Add the pure formatter**

In `server/src/modules/reviews/helpers.ts`, add:

```ts
/**
 * Format resolved (name, body) skill rows into the labeled strings
 * reviewer-core's `skills: string[]` expects — the label keeps the trace's
 * "## Skills / rules" block readable and skill boundaries clear to the model.
 */
export function formatSkillsForPrompt(rows: { name: string; body: string }[]): string[] {
  return rows.map((r) => `### ${r.name}\n${r.body}`);
}
```

- [ ] **Step 2: Write its unit test**

Create `server/src/modules/reviews/helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatSkillsForPrompt } from './helpers.js';

describe('formatSkillsForPrompt', () => {
  it('labels each skill with a ### heading', () => {
    expect(
      formatSkillsForPrompt([
        { name: 'Security rubric', body: '- Flag hardcoded secrets' },
        { name: 'Style', body: '- Prefer const' },
      ]),
    ).toEqual(['### Security rubric\n- Flag hardcoded secrets', '### Style\n- Prefer const']);
  });

  it('returns [] for no rows', () => {
    expect(formatSkillsForPrompt([])).toEqual([]);
  });
});
```

Run: `cd server && pnpm exec vitest run src/modules/reviews/helpers.test.ts`
Expected: 2 passing tests.

- [ ] **Step 3: Wire it into `run-executor.ts`**

In `server/src/modules/reviews/run-executor.ts`, add the import:

```ts
import { taskLine, formatSkillsForPrompt } from './helpers.js';
```

(replacing the existing `import { taskLine } from './helpers.js';` at line 9).

Then, in `runOneAgent`, immediately before the `// ---- Engine: assemble → single-pass → grounding` comment (line 187) — i.e. right after `const task = taskLine(pull) + rankNote;` (line 185) — add:

```ts
      // Skills enabled for THIS agent (global toggle AND per-agent toggle both
      // on), ordered — becomes the prompt's labeled "## Skills / rules" block.
      const enabledSkills = await this.agents.enabledSkillsForAgent(agent.id);
      const skills = formatSkillsForPrompt(enabledSkills);
```

Then in the `reviewPullRequest({...})` call (lines 191-213), add `...(skills.length ? { skills } : {}),` right after the `strategy` line:

```ts
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        ...(skills.length ? { skills } : {}),
        ...(callersDigest ? { callers: callersDigest } : {}),
        ...(repoMap ? { repoMap } : {}),
        ...(pull.body ? { prDescription: pull.body } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
```

- [ ] **Step 4: Write the wiring unit test**

Create `server/src/modules/reviews/run-executor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ReviewRunExecutor } from './run-executor.js';
import { MockGitClient, MockLLMProvider } from '../../adapters/mocks.js';
import { Container, type ContainerOverrides } from '../../platform/container.js';
import type { AppConfig } from '../../platform/config.js';
import type { Db } from '../../db/client.js';
import type { AgentRow } from '../../db/rows.js';
import type { PullRow, ReviewRepository } from './repository.js';

function makeContainer(overrides: ContainerOverrides): Container {
  const config = { cloneDir: '/tmp', secretsPath: '/tmp/s.json', embeddingsEnabled: false } as unknown as AppConfig;
  return new Container(config, {} as Db, overrides);
}

function fakeRepo(): ReviewRepository {
  return {
    insertReview: async (v: unknown) => ({ id: 'review-1', ...(v as object), createdAt: new Date() }),
    insertFindings: async () => [],
    markReviewed: async () => {},
    completeAgentRun: async () => {},
    saveRunTrace: async () => {},
  } as unknown as ReviewRepository;
}

const pullRow: PullRow = {
  id: 'pr-1', workspaceId: 'ws-1', repoId: 'repo-1', number: 482,
  title: 'x', author: 'a', branch: 'b', base: 'main', headSha: 'a1b2c3d4',
  lastReviewedSha: null, additions: 0, deletions: 0, filesCount: 0,
  status: 'open', body: null, openedAt: null, updatedAt: null,
};

const repoRow = {
  id: 'repo-1', workspaceId: 'ws-1', owner: 'acme', name: 'app',
  fullName: 'acme/app', clonePath: null, createdBy: 'sys', lastPolledAt: null,
} as unknown as Parameters<ReviewRunExecutor['executeRuns']>[2];

// repoIntel: false so the executor skips all repo-intel enrichment (which would
// otherwise need a real DB-backed RepoIntelService).
const baseAgent: AgentRow = {
  id: 'agent-1', workspaceId: 'ws-1', name: 'Sec Reviewer', description: '',
  provider: 'openai', model: 'gpt-4.1', systemPrompt: 'You review code.',
  outputSchema: null, strategy: 'single-pass', ciFailOn: 'critical',
  repoIntel: false, enabled: true, version: 1, createdBy: null, createdAt: new Date(),
};

const REVIEW_FIXTURE = { verdict: 'approve', summary: 'ok', score: 90, findings: [] };

function userMessageOf(llm: MockLLMProvider): string {
  const call = llm.calls.find((c) => c.method === 'completeStructured')!;
  const messages = (call.req as { messages: { role: string; content: string }[] }).messages;
  return messages.find((m) => m.role === 'user')!.content;
}

describe('ReviewRunExecutor — skills wiring', () => {
  it('injects enabled skills into the assembled prompt', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const agentsRepo = {
      enabledSkillsForAgent: async () => [{ name: 'Security rubric', body: '- Flag hardcoded secrets' }],
    } as unknown as Container['agentsRepo'];
    const container = makeContainer({ git: new MockGitClient(), llm: { openai: llm } });
    const executor = new ReviewRunExecutor(container, fakeRepo(), agentsRepo);

    await executor.executeRuns('ws-1', pullRow, repoRow, [{ agent: baseAgent, runId: 'run-1' }]);

    const userMsg = userMessageOf(llm);
    expect(userMsg).toContain('## Skills / rules');
    expect(userMsg).toContain('Security rubric');
    expect(userMsg).toContain('Flag hardcoded secrets');
  });

  it('omits the Skills section when no skill is enabled (disabled or globally off)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const agentsRepo = {
      enabledSkillsForAgent: async () => [],
    } as unknown as Container['agentsRepo'];
    const container = makeContainer({ git: new MockGitClient(), llm: { openai: llm } });
    const executor = new ReviewRunExecutor(container, fakeRepo(), agentsRepo);

    await executor.executeRuns('ws-1', pullRow, repoRow, [{ agent: baseAgent, runId: 'run-2' }]);

    expect(userMessageOf(llm)).not.toContain('## Skills / rules');
  });
});
```

- [ ] **Step 5: Run it**

Run: `cd server && pnpm exec vitest run src/modules/reviews/run-executor.test.ts`
Expected: 2 passing tests.

- [ ] **Step 6: Run the whole server unit suite + typecheck**

Run: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/reviews/helpers.ts server/src/modules/reviews/run-executor.ts server/src/modules/reviews/helpers.test.ts server/src/modules/reviews/run-executor.test.ts
git commit -m "feat(reviews): inject enabled skills into the review prompt (the spec's crux)"
```

---

### Task 8: Client — `use-skills` + agent-skills hooks

**Files:**
- Create: `client/src/lib/hooks/skills.ts`
- Modify: `client/src/lib/hooks/agents.ts` (add `useAgentSkills`, `useSetAgentSkills`)

**Interfaces:**
- Consumes: `Skill`, `CreateSkillInput`, `UpdateSkillInput`, `AgentSkillLink` from `@devdigest/shared` (Task 2); `api` client (`client/src/lib/api.ts`, unchanged).
- Produces: `useSkills`, `useSkill`, `useCreateSkill`, `useUpdateSkill`, `useDeleteSkill` — consumed by Tasks 9/10/11. `useAgentSkills`, `useSetAgentSkills` — consumed by Task 11.

- [ ] **Step 1: Write the skills hooks**

Create `client/src/lib/hooks/skills.ts`:

```ts
/* hooks/skills.ts — React Query hooks for the A1 Skills page + Agent editor Skills tab. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CreateSkillInput, Skill, UpdateSkillInput } from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillArgs {
  id: string;
  patch: UpdateSkillInput;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillArgs) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}
```

- [ ] **Step 2: Add agent-skills hooks**

In `client/src/lib/hooks/agents.ts`, add the import of `AgentSkillLink` to the existing type import (line 6):

```ts
import type { Agent, AgentSkillLink, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";
```

Then append at the end of the file:

```ts
/** An agent's linked skills (ordered). */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SetAgentSkillsInput {
  agentId: string;
  links: { skill_id: string; enabled: boolean }[];
}

/** Replace an agent's whole ordered skill-link set (Skills tab Save). */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, links }: SetAgentSkillsInput) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { links }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", vars.agentId] });
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/hooks/skills.ts client/src/lib/hooks/agents.ts
git commit -m "feat(client): skills + agent-skills TanStack Query hooks"
```

---

### Task 9: Client — Skills list page (`/skills`)

**Files:**
- Create: `client/src/app/skills/page.tsx`
- Create: `client/src/app/skills/_components/SkillsListView/SkillsListView.tsx`
- Create: `client/src/app/skills/_components/SkillsListView/styles.ts`
- Create: `client/src/app/skills/_components/SkillsListView/constants.ts`
- Create: `client/src/app/skills/_components/SkillsListView/helpers.ts`
- Create: `client/src/app/skills/_components/SkillsListView/index.ts`
- Create: `client/src/app/skills/_components/SkillsListView/SkillsListView.test.tsx`
- Create: `client/src/app/skills/_components/SkillsListView/_components/SkillCard/SkillCard.tsx`
- Create: `client/src/app/skills/_components/SkillsListView/_components/SkillCard/styles.ts`
- Create: `client/src/app/skills/_components/SkillsListView/_components/SkillCard/index.ts`
- Create: `client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal/CreateSkillModal.tsx`
- Create: `client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal/styles.ts`
- Create: `client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal/constants.ts`
- Create: `client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal/index.ts`
- Modify (rewrite): `client/messages/en/skills.json`

**Interfaces:**
- Consumes: `useSkills`, `useUpdateSkill`, `useCreateSkill` (Task 8); `AppShell` (`client/src/components/app-shell`, unchanged); vendored UI (`Button`, `Dropdown`, `EmptyState`, `ErrorState`, `Skeleton`, `Icon`, `Badge`, `Toggle`, `Markdown`, `Modal`, `FormField`, `TextInput`, `SelectInput`, `Textarea`).
- Produces: the `/skills` route, reachable once Task 12 adds its nav entry.

- [ ] **Step 1: Rewrite the i18n messages**

Replace the entire contents of `client/messages/en/skills.json` with:

```json
{
  "list": {
    "crumbLab": "Skills Lab",
    "crumb": "Skills",
    "title": "Skills",
    "subtitle": "Reusable rules and rubrics an agent can attach to its review prompt.",
    "searchPlaceholder": "Search skills…",
    "addSkill": "Add Skill",
    "createFromScratch": "Create",
    "importSoon": "Import (coming soon)",
    "loadError": "Could not load skills.",
    "emptyTitle": "No skills yet",
    "emptyBody": "A skill is a reusable rule or rubric an agent can attach to its review prompt.",
    "emptyCta": "Create your first skill",
    "selectTitle": "Select a skill",
    "selectBody": "Pick a skill on the left to preview its body."
  },
  "card": {
    "noDescription": "No description"
  },
  "typeOptions": {
    "rubric": "Rubric",
    "convention": "Convention",
    "security": "Security",
    "custom": "Custom"
  },
  "preview": {
    "edit": "Edit",
    "enabled": "Enabled",
    "disabled": "Disabled"
  },
  "create": {
    "title": "Create skill",
    "subtitle": "A skill is a reusable rule or rubric an agent can attach to its review prompt.",
    "cancel": "Cancel",
    "create": "Create skill",
    "creating": "Creating…",
    "defaultName": "New Skill",
    "fields": {
      "name": "Name",
      "namePlaceholder": "PR quality rubric",
      "description": "Description",
      "descriptionPlaceholder": "What this skill checks for",
      "type": "Type",
      "body": "Body (Markdown)",
      "bodyPlaceholder": "# Rule\nDescribe the rule…"
    }
  },
  "editor": {
    "crumbFallback": "Skill",
    "back": "← All skills",
    "loadErrorTitle": "Couldn't load this skill",
    "loadErrorBody": "The skill could not be loaded.",
    "notFoundTitle": "Skill not found",
    "notFoundBody": "It may have been deleted.",
    "name": "Name",
    "description": "Description",
    "descriptionHint": "The skill's directive interface — write it as an instruction.",
    "type": "Type",
    "body": "Body (Markdown)",
    "bodyHint": "Saving a changed body creates a new immutable version.",
    "preview": "Preview",
    "enabled": "Enabled",
    "version": "v{version}",
    "save": "Save skill",
    "saving": "Saving…",
    "saved": "Saved (v{version})",
    "savedToast": "Skill saved (v{version})",
    "delete": "Delete skill",
    "deleteConfirm": "Delete skill \"{name}\"? This cannot be undone."
  }
}
```

(The prior contents were speculative copy for an import flow this slice defers — nothing referenced them yet, confirmed via grep before this rewrite.)

- [ ] **Step 2: `SkillCard`**

Create `client/src/app/skills/_components/SkillsListView/_components/SkillCard/SkillCard.tsx`:

```tsx
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color="var(--text-secondary)">{t(`typeOptions.${skill.type}`)}</Badge>
      </div>
    </div>
  );
}
```

Create `.../SkillCard/styles.ts`:

```ts
import type { CSSProperties } from "react";

/** Co-located styles for SkillCard (mirrors AgentCard). */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    marginBottom: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  description: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "8px 0",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
} as const;
```

Create `.../SkillCard/index.ts`:

```ts
export { SkillCard, SkillCard as default } from "./SkillCard";
```

- [ ] **Step 3: `CreateSkillModal`**

Create `.../CreateSkillModal/constants.ts`:

```ts
import type { SkillType } from "@devdigest/shared";

/** Selectable skill types (labels are i18n'd in the component). */
export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Default type for a new skill. */
export const DEFAULT_TYPE: SkillType = "convention";

/** Modal width (px). */
export const MODAL_WIDTH = 560;
```

Create `.../CreateSkillModal/CreateSkillModal.tsx`:

```tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { DEFAULT_TYPE, MODAL_WIDTH, TYPE_VALUES } from "./constants";
import { s } from "./styles";

/** Create-skill modal — name/description/type/body. */
export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`typeOptions.${v}`) }));

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim() || t("create.defaultName"),
      description,
      type,
      body,
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("create.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("create.fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("create.fields.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>
        <FormField label={t("create.fields.body")}>
          <Textarea
            value={body}
            onChange={setBody}
            rows={8}
            mono
            placeholder={t("create.fields.bodyPlaceholder")}
          />
        </FormField>
      </div>
    </Modal>
  );
}
```

Create `.../CreateSkillModal/styles.ts`:

```ts
import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal (mirrors CreateAgentModal). */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
```

Create `.../CreateSkillModal/index.ts`:

```ts
export { CreateSkillModal, CreateSkillModal as default } from "./CreateSkillModal";
```

- [ ] **Step 4: `SkillsListView` (list + filter + inline preview panel)**

Create `.../SkillsListView/constants.ts`:

```ts
/** Grid column template for the skills card grid. */
export const CARD_GRID_COLS = "repeat(auto-fill, minmax(220px, 1fr))";
```

Create `.../SkillsListView/helpers.ts`:

```ts
import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}
```

Create `.../SkillsListView/styles.ts`:

```ts
import type { CSSProperties } from "react";
import { CARD_GRID_COLS } from "./constants";

/** Co-located styles for SkillsListView. */
export const s = {
  page: { display: "flex", minHeight: "calc(100vh - 52px)" } satisfies CSSProperties,
  main: { flex: 1, padding: "24px 32px 44px", minWidth: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: CARD_GRID_COLS, gap: 14 } satisfies CSSProperties,
  panel: {
    width: 380,
    flexShrink: 0,
    borderLeft: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "auto",
  } satisfies CSSProperties,
  panelEmpty: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 32,
    textAlign: "center",
  } satisfies CSSProperties,
  panelEmptyTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  panelEmptyBody: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  panelBody: { padding: 20 } satisfies CSSProperties,
  panelHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } satisfies CSSProperties,
  panelTitle: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  panelDescription: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 } satisfies CSSProperties,
  panelMarkdown: {
    fontSize: 13,
    borderTop: "1px solid var(--border)",
    paddingTop: 16,
  } satisfies CSSProperties,
} as const;
```

Create `.../SkillsListView/SkillsListView.tsx`:

```tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon, Badge, Markdown } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const list = filterSkills(skills ?? [], search);
  const selected = list.find((sk) => sk.id === selectedId) ?? null;

  return (
    <AppShell crumb={[{ label: t("list.crumbLab") }, { label: t("list.crumb") }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      <div style={s.page}>
        <div style={s.main}>
          <div style={s.header}>
            <div style={s.headerText}>
              <h1 style={s.h1}>{t("list.title")}</h1>
              <p style={s.subtitle}>{t("list.subtitle")}</p>
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("list.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("list.addSkill")}
                </Button>
              }
              items={[
                { label: t("list.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
                { divider: true },
                { label: t("list.importSoon"), icon: "Upload", muted: true, onClick: () => {} },
              ]}
            />
          </div>

          {isLoading && (
            <div style={s.grid}>
              <Skeleton height={120} />
              <Skeleton height={120} />
              <Skeleton height={120} />
            </div>
          )}
          {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
          {!isLoading && !isError && list.length === 0 && (
            <EmptyState
              icon="Sparkles"
              title={t("list.emptyTitle")}
              body={t("list.emptyBody")}
              cta={t("list.emptyCta")}
              onCta={() => setCreating(true)}
            />
          )}
          {list.length > 0 && (
            <div style={s.grid}>
              {list.map((sk) => (
                <SkillCard
                  key={sk.id}
                  skill={sk}
                  active={sk.id === selectedId}
                  onClick={() => setSelectedId(sk.id)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                />
              ))}
            </div>
          )}
        </div>

        <div style={s.panel}>
          {!selected && (
            <div style={s.panelEmpty}>
              <Icon.Sparkles size={20} style={{ color: "var(--text-muted)" }} />
              <h3 style={s.panelEmptyTitle}>{t("list.selectTitle")}</h3>
              <p style={s.panelEmptyBody}>{t("list.selectBody")}</p>
            </div>
          )}
          {selected && (
            <div style={s.panelBody}>
              <div style={s.panelHeader}>
                <h2 style={s.panelTitle}>{selected.name}</h2>
                <Badge color="var(--text-secondary)">{t(`typeOptions.${selected.type}`)}</Badge>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="Pencil"
                  onClick={() => router.push(`/skills/${selected.id}`)}
                >
                  {t("preview.edit")}
                </Button>
              </div>
              <div style={s.panelDescription}>{selected.description}</div>
              <div style={s.panelMarkdown}>
                <Markdown>{selected.body}</Markdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
```

Create `.../SkillsListView/index.ts`:

```ts
export { SkillsListView, SkillsListView as default } from "./SkillsListView";
```

- [ ] **Step 5: Route entry**

Create `client/src/app/skills/page.tsx`:

```tsx
import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills list + preview). Thin route entry — the view, its
   create modal, styles, constants, helpers and i18n are colocated under
   _components/SkillsListView. */
export default function SkillsPage() {
  return <SkillsListView />;
}
```

- [ ] **Step 6: RTL smoke test**

Create `.../SkillsListView/SkillsListView.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(cleanup);

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "Security rubric",
    description: "Flags secrets and injection",
    type: "security",
    source: "manual",
    body: "# Rule\nFlag hardcoded credentials.",
    enabled: true,
    version: 1,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("A1 Skills list (smoke)", () => {
  it("renders the heading and the seeded skill card", () => {
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Security rubric")).toBeInTheDocument();
  });

  it("shows the preview panel prompt until a card is selected", () => {
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test**

Run: `cd client && pnpm exec vitest run src/app/skills/_components/SkillsListView/SkillsListView.test.tsx`
Expected: 2 passing tests.

- [ ] **Step 8: Typecheck + commit**

Run: `cd client && pnpm typecheck`
Expected: no errors.

```bash
git add client/src/app/skills/page.tsx client/src/app/skills/_components/SkillsListView client/messages/en/skills.json
git commit -m "feat(client): Skills list page (cards, search, create, inline preview)"
```

---

### Task 10: Client — Skill editor page (`/skills/[id]`)

**Files:**
- Create: `client/src/app/skills/[id]/page.tsx`
- Create: `client/src/app/skills/[id]/_components/SkillEditorView/SkillEditorView.tsx`
- Create: `client/src/app/skills/[id]/_components/SkillEditorView/styles.ts`
- Create: `client/src/app/skills/[id]/_components/SkillEditorView/constants.ts`
- Create: `client/src/app/skills/[id]/_components/SkillEditorView/index.ts`
- Create: `client/src/app/skills/[id]/_components/SkillEditorView/SkillEditorView.test.tsx`

**Interfaces:**
- Consumes: `useSkill`, `useUpdateSkill`, `useDeleteSkill` (Task 8); `useToast` (`client/src/lib/toast`, unchanged).

- [ ] **Step 1: Constants + styles**

Create `.../SkillEditorView/constants.ts`:

```ts
import type { SkillType } from "@devdigest/shared";

/** Selectable skill types (labels are i18n'd in the component). */
export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
```

Create `.../SkillEditorView/styles.ts`:

```ts
import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorView. */
export const s = {
  wrap: { padding: "16px 28px 44px", maxWidth: 1040, margin: "0 auto" } satisfies CSSProperties,
  header: { marginBottom: 10 } satisfies CSSProperties,
  backLink: {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 } satisfies CSSProperties,
  form: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  preview: {
    borderLeft: "1px solid var(--border)",
    paddingLeft: 28,
    minWidth: 0,
    overflow: "auto",
  } satisfies CSSProperties,
  previewLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    marginBottom: 10,
    textTransform: "uppercase",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
```

- [ ] **Step 2: `SkillEditorView`**

Create `.../SkillEditorView/SkillEditorView.tsx`:

```tsx
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  ErrorState,
  Skeleton,
  Icon,
  Badge,
  FormField,
  TextInput,
  SelectInput,
  Textarea,
  Toggle,
  Markdown,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useSkill, useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function SkillEditorView() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("skills");
  const { id } = params;

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [body, setBody] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);

  React.useEffect(() => {
    if (!skill) return;
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const crumb = [
    { label: t("list.crumbLab") },
    { label: t("list.crumb"), href: "/skills" },
    { label: skill?.name ?? t("editor.crumbFallback") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  if (isLoading || !skill) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.wrap}>
          <Skeleton height={24} width={240} />
          <Skeleton height={300} />
        </div>
      </AppShell>
    );
  }

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`typeOptions.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("editor.savedToast", { version: data.version })) },
    );

  const remove = () => {
    if (!window.confirm(t("editor.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, { onSuccess: () => router.push("/skills") });
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.header}>
          <button onClick={() => router.push("/skills")} style={s.backLink}>
            {t("editor.back")}
          </button>
        </div>
        <div style={s.titleRow}>
          <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
          <h1 style={s.h1}>{skill.name}</h1>
          <Badge color="var(--text-secondary)" mono>
            {t("editor.version", { version: skill.version })}
          </Badge>
          <label style={s.enabledLabel}>
            {t("editor.enabled")}
            <Toggle on={enabled} onChange={setEnabled} size={16} />
          </label>
        </div>
        <div style={s.grid}>
          <div style={s.form}>
            <FormField label={t("editor.name")} required>
              <TextInput value={name} onChange={setName} />
            </FormField>
            <FormField label={t("editor.description")} hint={t("editor.descriptionHint")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <FormField label={t("editor.type")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
            <FormField label={t("editor.body")} hint={t("editor.bodyHint")}>
              <Textarea value={body} onChange={setBody} rows={16} mono />
            </FormField>
            <div style={s.actions}>
              <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
                {update.isPending ? t("editor.saving") : t("editor.save")}
              </Button>
              {update.isSuccess && (
                <span style={s.savedNote}>{t("editor.saved", { version: update.data?.version })}</span>
              )}
              <Button kind="ghost" icon="Trash" onClick={remove} disabled={del.isPending}>
                {t("editor.delete")}
              </Button>
            </div>
          </div>
          <div style={s.preview}>
            <div style={s.previewLabel}>{t("editor.preview")}</div>
            <Markdown>{body}</Markdown>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
```

Create `.../SkillEditorView/index.ts`:

```ts
export { SkillEditorView, SkillEditorView as default } from "./SkillEditorView";
```

- [ ] **Step 3: Route entry**

Create `client/src/app/skills/[id]/page.tsx`:

```tsx
import { SkillEditorView } from "./_components/SkillEditorView";

/* Route: /skills/:id (Skill editor). Thin route entry — the view, its styles,
   constants and i18n are colocated under _components/SkillEditorView. */
export default function SkillEditorPage() {
  return <SkillEditorView />;
}
```

- [ ] **Step 4: RTL smoke test**

Create `.../SkillEditorView/SkillEditorView.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../lib/toast";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "sk1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../../../../lib/hooks/skills", () => ({
  useSkill: () => ({ data: SKILL, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillEditorView } from "./SkillEditorView";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "Security rubric",
  description: "Flags secrets and injection",
  type: "security",
  source: "manual",
  body: "# Rule\nFlag hardcoded credentials.",
  enabled: true,
  version: 3,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A1 Skill Editor (smoke)", () => {
  it("renders the skill's fields and version badge", () => {
    renderWithIntl(<SkillEditorView />);
    expect(screen.getAllByText("Security rubric").length).toBeGreaterThan(0);
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("Save skill")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the test**

Run: `cd client && pnpm exec vitest run src/app/skills/[id]/_components/SkillEditorView/SkillEditorView.test.tsx`
Expected: 1 passing test.

- [ ] **Step 6: Typecheck + commit**

Run: `cd client && pnpm typecheck`
Expected: no errors.

```bash
git add "client/src/app/skills/[id]"
git commit -m "feat(client): Skill editor page (form, live markdown preview, version, delete)"
```

---

### Task 11: Client — Agent editor "Skills" tab

**Files:**
- Create: `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx`
- Create: `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/styles.ts`
- Create: `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/helpers.ts`
- Create: `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/index.ts`
- Create: `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.test.tsx`
- Modify: `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`
- Modify: `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`
- Modify: `client/src/app/agents/[id]/_components/AgentEditorView/AgentEditorView.tsx:15` (`VALID_TABS`)
- Modify: `client/messages/en/agents.json` (add one key: `skills.savedToast`)

**Interfaces:**
- Consumes: `useSkills` (Task 8), `useAgentSkills`/`useSetAgentSkills` (Task 8), existing `agents.json` keys `skills.title`/`skills.enabledCount`/`skills.filterPlaceholder`/`skills.orderHint` (already present, unused until now).

- [ ] **Step 1: Add the one missing message key**

In `client/messages/en/agents.json`, in the `"skills"` block (currently `title`/`enabledCount`/`filterPlaceholder`/`orderHint`), add `"savedToast"`:

```json
  "skills": {
    "title": "Skills",
    "enabledCount": "{linked} of {total} enabled",
    "filterPlaceholder": "Filter skills…",
    "orderHint": "Order matters — earlier skills appear earlier in the assembled prompt. Toggle to attach.",
    "savedToast": "Skills saved"
  },
```

- [ ] **Step 2: Merge + reorder helpers**

Create `.../SkillsTab/helpers.ts`:

```ts
import type { AgentSkillLink, Skill } from "@devdigest/shared";

export interface SkillRowState {
  skill: Skill;
  enabled: boolean;
}

/**
 * Merge all workspace skills with the agent's saved links into one ordered
 * list: linked skills first (in their saved order + enabled state), then any
 * skill not yet linked to this agent, appended unchecked. Matches the spec:
 * "Skills created after an agent last saved appear appended, unchecked, and
 * get a row on the next save."
 */
export function mergeSkillsWithLinks(skills: Skill[], links: AgentSkillLink[]): SkillRowState[] {
  const bySkillId = new Map(links.map((l) => [l.skill_id, l]));
  const ordered = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => skills.find((sk) => sk.id === l.skill_id))
    .filter((sk): sk is Skill => !!sk)
    .map((sk) => ({ skill: sk, enabled: bySkillId.get(sk.id)!.enabled }));
  const unlinked = skills
    .filter((sk) => !bySkillId.has(sk.id))
    .map((sk) => ({ skill: sk, enabled: false }));
  return [...ordered, ...unlinked];
}

/** Move the item at `from` to position `to`, returning a new array. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved!);
  return copy;
}
```

- [ ] **Step 3: Styles**

Create `.../SkillsTab/styles.ts`:

```ts
import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  filter: {
    width: "100%",
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    marginBottom: 14,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    cursor: "grab",
  } satisfies CSSProperties,
  dragHandle: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 13, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
} as const;
```

- [ ] **Step 4: `SkillsTab` component**

Create `.../SkillsTab/SkillsTab.tsx`:

```tsx
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, Badge } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../../lib/toast";
import { mergeSkillsWithLinks, reorder, type SkillRowState } from "./helpers";
import { s } from "./styles";

/** Agent editor "Skills" tab — merge, drag-reorder, per-agent enable, save. */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { data: skills } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setAgentSkills = useSetAgentSkills();

  const [rows, setRows] = React.useState<SkillRowState[]>([]);
  const [filter, setFilter] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!skills || !links) return;
    setRows(mergeSkillsWithLinks(skills, links));
  }, [skills, links]);

  const enabledCount = rows.filter((r) => r.enabled).length;

  const toggle = (skillId: string, enabled: boolean) =>
    setRows((prev) => prev.map((r) => (r.skill.id === skillId ? { ...r, enabled } : r)));

  const onDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    setRows((prev) => reorder(prev, dragIndex, dropIndex));
    setDragIndex(null);
  };

  const save = () =>
    setAgentSkills.mutate(
      { agentId: agent.id, links: rows.map((r) => ({ skill_id: r.skill.id, enabled: r.enabled })) },
      { onSuccess: () => toast.success(t("skills.savedToast")) },
    );

  // Filter is display-only; drag/drop and toggles still act on the real
  // index within `rows` so reordering stays correct while filtering.
  const visible = rows
    .map((r, i) => ({ row: r, index: i }))
    .filter(({ row }) => row.skill.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: enabledCount, total: rows.length })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("skills.filterPlaceholder")}
        style={s.filter}
      />
      <div style={s.list}>
        {visible.map(({ row, index }) => (
          <div
            key={row.skill.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(index)}
            style={s.row}
          >
            <Icon.Menu size={14} style={s.dragHandle} />
            <Checkbox checked={row.enabled} onChange={(v) => toggle(row.skill.id, v)} />
            <span style={s.name}>{row.skill.name}</span>
            <Badge color="var(--text-secondary)">{row.skill.type}</Badge>
          </div>
        ))}
      </div>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={setAgentSkills.isPending}>
          {setAgentSkills.isPending ? t("config.saving") : t("config.save")}
        </Button>
      </div>
    </div>
  );
}
```

Create `.../SkillsTab/index.ts`:

```ts
export { SkillsTab, SkillsTab as default } from "./SkillsTab";
```

- [ ] **Step 5: Wire it into the Agent editor**

In `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, update `TABS`:

```ts
/** Editor tabs. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
];
```

In `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, add the import and swap the body render:

```tsx
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
```

```tsx
      <div style={s.body}>
        {tab === "skills" ? <SkillsTab agent={agent} /> : <ConfigTab agent={agent} />}
      </div>
```

In `client/src/app/agents/[id]/_components/AgentEditorView/AgentEditorView.tsx:15`, update:

```ts
const VALID_TABS = ["config", "skills"];
```

- [ ] **Step 6: RTL test**

Create `.../SkillsTab/SkillsTab.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: LINKS }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const SKILLS: Skill[] = [
  { id: "sk1", name: "Security rubric", description: "", type: "security", source: "manual", body: "b1", enabled: true, version: 1 },
  { id: "sk2", name: "Style guide", description: "", type: "convention", source: "manual", body: "b2", enabled: true, version: 1 },
];

// sk1 linked+enabled, sk2 NOT linked → appended unchecked by the merge helper.
const LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "sk1", order: 0, enabled: true }];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Agent editor SkillsTab (smoke)", () => {
  it("merges linked + unlinked skills and shows the enabled count", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("Security rubric")).toBeInTheDocument();
    expect(screen.getByText("Style guide")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test**

Run: `cd client && pnpm exec vitest run "src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.test.tsx"`
Expected: 1 passing test.

- [ ] **Step 8: Run the existing `AgentEditor.test.tsx` to confirm no regression**

Run: `cd client && pnpm exec vitest run "src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx"`
Expected: still passes (Config tab renders by default when `tab="config"`).

- [ ] **Step 9: Typecheck + commit**

Run: `cd client && pnpm typecheck`
Expected: no errors.

```bash
git add "client/src/app/agents/[id]/_components/AgentEditor" client/messages/en/agents.json
git commit -m "feat(client): Agent editor Skills tab (merge, drag reorder, enable, save)"
```

---

### Task 12: Client — nav entry for `/skills`

**Files:**
- Modify: `client/src/vendor/ui/nav.ts`

**Interfaces:**
- Consumes: nothing new — `client/src/components/app-shell/helpers.ts:33` (`activeKeyFor`) already maps `pathname.startsWith("/skills")` to `"skills"`, anticipating this entry.

- [ ] **Step 1: Add the NAV entry and shortcut**

In `client/src/vendor/ui/nav.ts`, update the `NAV` array:

```ts
export const NAV: NavGroup[] = [
  {
    section: "WORKSPACE",
    items: [
      { key: "pulls", label: "Pull Requests", icon: "GitPullRequest", href: "/repos/:repoId/pulls", gKey: "p" },
      { key: "agents", label: "Agents", icon: "Cpu", href: "/agents", gKey: "a" },
      { key: "skills", label: "Skills", icon: "Sparkles", href: "/skills", gKey: "s" },
    ],
  },
];
```

And add a matching entry to `SHORTCUTS`:

```ts
export const SHORTCUTS: ShortcutDef[] = [
  { keys: "⌘K", label: "Open command palette", group: "Global" },
  { keys: "?", label: "Show keyboard shortcuts", group: "Global" },
  { keys: "g p", label: "Go to Pull Requests", group: "Navigation" },
  { keys: "g a", label: "Go to Agents", group: "Navigation" },
  { keys: "g s", label: "Go to Skills", group: "Navigation" },
  { keys: "j / k", label: "Next / previous finding", group: "Findings" },
  { keys: "a", label: "Accept finding", group: "Findings" },
  { keys: "d", label: "Dismiss finding", group: "Findings" },
];
```

- [ ] **Step 2: Typecheck**

Run: `cd client && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `cd client && pnpm dev` (and the server via `cd server && pnpm dev` in another shell, with Postgres up per `./scripts/dev.sh` if not already running).

In a browser: confirm a "Skills" item appears in the WORKSPACE nav group between Agents and Settings, that `g` then `s` navigates to `/skills`, that `/skills` renders the (likely empty) list with a working "Add Skill → Create" flow, and that an agent's editor now shows a "Skills" tab.

- [ ] **Step 4: Commit**

```bash
git add client/src/vendor/ui/nav.ts
git commit -m "feat(client): add Skills nav entry + g-then-s shortcut"
```

---

## End-to-end acceptance check (after Task 12)

1. Create a skill (e.g. type `security`, body `Flag any hardcoded credential.`).
2. Open an agent's editor → Skills tab → check the new skill, Save.
3. Trigger a review run for that agent on any PR.
4. Open the run's trace: `prompt_assembly.skills` (and the rendered "## Skills / rules" section) should contain `### <skill name>\n<skill body>`.
5. Uncheck the skill on the agent (or toggle the skill's global `enabled` off) and re-run: the trace's `prompt_assembly.skills` should be `null` / the section absent.

This is the spec's stated crux (`docs/superpowers/specs/2026-07-04-skills-core-loop-design.md`, "The crux") and should be spot-checked manually once Tasks 1–12 are done, in addition to the automated coverage in Tasks 4, 6, and 7.
