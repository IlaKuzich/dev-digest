---
name: onion-architecture-v2
description: "Use when adding or refactoring a DevDigest server feature module (server/src/modules/<name>) — creating routes/service/repository, deciding where business logic, persistence, or an external integration belongs, wiring a new adapter through the DI container, or keeping the domain core free of DB/HTTP/SDK concerns. Also use for HARDER dependency-rule cases: adapter-to-adapter coupling, a DTO mapper that leaks one internal field, a repository param that looks tenancy-scoped but isn't actually used in the query, a hand-rolled interface that fakes DI without going through the container, infra-specific error types leaking through an unhandled exception, secrets read inside a wiring/container file instead of via SecretsProvider, or business logic buried in a JobRunner job handler closure. Trigger terms: onion architecture, layering, ports and adapters, dependency rule, composition root, container, adapter, repository layer, where does this code go, tenancy guard, IDOR, DTO leak."
metadata:
  tags: onion-architecture, ports-and-adapters, layering, dependency-injection, backend, server, modules, v2
---

# Onion Architecture (DevDigest server) — v2

## Overview
The `server/` package is an onion: **dependencies point inward only.** The pure
domain core (Zod contracts + port interfaces) knows nothing about Postgres,
Fastify, or vendor SDKs. Outer layers depend on inner ones through interfaces;
the composition root (`platform/container.ts`) is the single place where
concrete adapters are wired to those interfaces.

This is a **pattern skill** — adapt it to the feature, but never invert the
dependency rule. Violating the letter (a `service.ts` importing `octokit`, a
`repository.ts` exposing a Drizzle row to a route) violates the spirit. The
letter is also not enough on its own: a module can satisfy every rule in the
["Common mistakes"](#common-mistakes) checklist below and still leak the
dependency rule's *intent* through a partially-mapped DTO, a decorative
tenancy parameter, or an interface that exists but was never actually wired
through the container. The ["Harder cases"](#harder-cases-things-that-look-fine-at-a-glance)
section exists because those are the ones a first read-through misses.

## Layer map (outer → inner)

| Layer | Lives in | Role | May import |
|---|---|---|---|
| **Transport** (primary adapter) | `modules/<name>/routes.ts` | Fastify + Zod: parse request, map status codes, delegate | service, `_shared/context`, contracts |
| **Application** (use case) | `modules/<name>/service.ts` (+ `helpers.ts`, `constants.ts`) | Business logic, orchestration; receives `Container` | ports, own repository, contracts, platform errors |
| **Persistence / Infra** (secondary adapters) | `modules/<name>/repository.ts`, `adapters/<port>/*` | The only code touching a DB table or a vendor SDK | `db/client`, `db/schema`, the port it implements, a shared base repository under `_shared/` |
| **Domain core** | `@devdigest/shared` (vendored at `src/vendor/shared`) | Zod contracts + **port interfaces** (`GitHubClient`, `LLMProvider`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider`…) | nothing — pure, zero side effects |
| **Composition root** | `platform/container.ts` | Wires concrete adapters → port interfaces, lazily; override-able in tests | everything |

The dependency rule in one line: **routes → service → (ports + repository); adapters _implement_ ports; the container wires them.** Nothing flows the other way.

## The Dependency Rule (non-negotiable)
- The domain core (`vendor/shared`) imports **nothing** from `server/src`.
- `service.ts` depends on **port interfaces**, never concrete adapter classes.
  Per server CLAUDE.md: *"Services receive `Container`; never instantiate adapters directly."*
- A `repository.ts` is the ONLY place that touches its table, and every query is
  workspace-scoped (tenancy guard). See `modules/repos/repository.ts`.
- Drizzle rows (`$inferSelect`) stay inside the repository/service; routes return
  DTOs from contracts (map via a `toXDto` helper — see `modules/repos/helpers.ts`).
- **A tenancy-scoped signature is not the same as a tenancy-scoped query.**
  `workspaceId` must appear in the actual `WHERE`/`and(...)` clause, not just
  in the method's parameter list. See "Harder cases" below.
- **An interface is not DI until something outside the module can substitute
  a different implementation.** A locally-declared interface backing a
  directly-`new`'d adapter is decoration, not inversion of control — the
  container has to be the thing choosing the concrete class.

## Canonical module recipe
A feature module is a thin slice through all layers:

```
modules/<name>/
  routes.ts       # transport: const service = new XService(app.container); delegates
  service.ts      # use case: class XService { constructor(private container: Container) {} }
  repository.ts   # persistence: class XRepository { constructor(private db: Db) {} }
  helpers.ts      # pure transforms (parse, map row → DTO) — no I/O
  constants.ts    # literals (job kinds, secret names, depths)
```

- **routes** declare Zod `params`/`body` schemas — no hand-rolled `Schema.parse(req.body)`.
- **service** calls ports off the container (`this.container.git`, `await this.container.github()`, `this.container.jobs.enqueue(...)`) and its own `repository`. A **job handler registered by the service** (`this.container.jobs.register(KIND, handler)`) is still application-layer code — it must call the module's own `repository`/ports like any other service method, never reach into `container.db` on its own to shortcut the persistence layer.
- **repository** returns rows; **helpers** map rows → contract DTOs. A repository MAY extend a shared base class under `_shared/` (e.g. `_shared/base-repository.ts`) for generic CRUD/pagination plumbing — that is code reuse within the same layer, not a cross-module reach-in, as long as the base class itself touches no specific module's table.

Reference implementation to copy: `modules/repos/` (`routes.ts` → `service.ts` → `repository.ts` → `helpers.ts`).

## Adding an external integration (a new port + adapter)
1. Define the **port interface** in `@devdigest/shared` (and re-vendor). It speaks
   the domain's language, not the vendor's.
2. Implement the **adapter** under `adapters/<port>/<impl>.ts` (e.g.
   `adapters/github/octokit.ts` implements `GitHubClient`). An adapter may call
   vendor SDKs and do its own I/O, but it must not import and call a *different*
   port's adapter directly (e.g. a GitHub adapter reaching into the Slack
   adapter to post a message) — each adapter implements exactly one port, and
   any coordination between two capabilities belongs in `service.ts`, which
   already has both ports available off the container.
3. Wire it in the **composition root** `platform/container.ts` as a lazy getter,
   resolving secrets via `SecretsProvider` (never `process.env`) — **this rule
   applies inside `container.ts` itself, not just in `service.ts`.** The
   container is the right *place* to construct an adapter; it is never a
   license to read `process.env` directly while doing so:
   ```ts
   get git(): GitClient {
     if (this.overrides.git) return this.overrides.git;   // tests inject mocks
     this._git ??= new SimpleGitClient(this.config.cloneDir);
     return this._git;
   }
   ```
4. Add the override slot to `ContainerOverrides` so unit tests inject a mock
   (`adapters/mocks.ts`) — no real network/DB in hermetic tests.

## Quick reference — "where does this code go?"
| You're writing… | Put it in |
|---|---|
| HTTP status / request parsing | `routes.ts` |
| Business rule / orchestration / job handler body | `service.ts` |
| SQL / Drizzle query | `repository.ts` |
| Pure transform, URL parse, row→DTO map | `helpers.ts` |
| Call to GitHub/LLM/git/filesystem | a **port** (interface in shared) + **adapter** in `adapters/` |
| Wiring a concrete impl to an interface | `platform/container.ts` |
| A Zod contract / shared type / port interface | `@devdigest/shared` |
| Translating a persistence-specific error (Postgres code, Drizzle exception shape) into a domain error | `repository.ts` or `service.ts` — never `routes.ts` |

## Common mistakes
- **Service `new`s an adapter** (`new OctokitGitHubClient(...)` inside `service.ts`).
  → Resolve it off the container; the container owns construction + secrets.
- **Route contains business logic** (loops, branching on domain state).
  → Move it to the service; routes only parse, delegate, and map status.
- **Repository leaks Drizzle rows to the client.** → Map to a contract DTO first.
- **Cross-module reach-in** (importing another module's `repository.ts`).
  → Share cross-cutting repos via the container (`container.reviewRepo`), and
  cross-package code only through `@devdigest/shared`. (A shared **base**
  repository class under `_shared/` is fine — see the recipe above.)
- **Domain core importing infra** (a contract file importing `drizzle`/`fastify`).
  → The core must stay pure; push the dependency outward to an adapter.
- **Reading `process.env` in feature code** (including inside `platform/container.ts`
  wiring code). → Secrets via `SecretsProvider`, config via `AppConfig`.
- **Adapter calls a sibling adapter directly** instead of the service coordinating
  both ports. → Move the coordination up to `service.ts`.
- **A job handler reaches into `container.db` directly** instead of calling the
  module's own `repository`. → Route it through `repository.ts` like every
  other read/write.

## Harder cases (things that look fine at a glance)
These are dependency-rule violations that pass a surface read — the file is in
the "right" layer, but the *content* still breaks the rule. Check for these
explicitly; don't stop once the obvious common mistakes are ruled out.

- **Partial DTO leak.** A `toXDto`-style mapper exists (so the module looks
  compliant), but it forwards an internal-only field from the row — a
  password/token hash, an internal note, a full nested relation the client
  never asked for. The presence of a mapper is not sufficient evidence of
  compliance; read what the mapper actually returns, field by field, against
  what the contract DTO is supposed to expose.
- **Decorative tenancy parameter.** A repository method accepts `workspaceId`
  (so its signature "looks" scoped) but never uses it in the `WHERE`/`and(...)`
  clause — the parameter is dead weight and the query is unscoped. Read the
  query body, not just the method signature.
- **Transitive tenancy gap on a child table.** A table keyed only by a parent
  entity's id (e.g. `pr_id`, no `workspace_id` column of its own) needs a JOIN
  back to the parent table to enforce tenancy — filtering on the child's own
  id/parent-id alone is not a tenancy guard, even if the surrounding code
  "feels" workspace-scoped. Mirror `getPull`'s join pattern for any child
  table like this.
- **Fake DI (an interface that was never actually wired).** `service.ts`
  declares its own local interface and assigns a directly-`new`'d concrete
  adapter to a field typed against it. Typing against an interface does not
  by itself satisfy the dependency rule — nothing outside `service.ts` can
  substitute a different implementation (no container getter, no override
  slot, no test mock path), so it's the "new`s an adapter" mistake wearing an
  interface as a costume.
- **Infra error types leaking through an exception, not an import.** A
  persistence-specific error (a raw Postgres error object, a Drizzle
  exception with a `.code`) propagates unhandled out of `repository.ts`, and
  a caller two layers up — worst case, `routes.ts` — inspects that
  vendor-specific shape (`err.code === '23505'`) to decide what to do.
  Nothing here *imports* `pg`/`drizzle-orm`, so a grep-only pass misses it;
  the leak travels through a thrown value, not a static dependency. Translate
  the error into a domain error (or a typed result) inside `repository.ts` or
  `service.ts`, before it ever reaches `routes.ts`.
- **Legitimate complexity is not automatically a violation.** A module that
  correctly juggles several container ports, a shared base repository, and a
  type-only cross-module DTO import can look "busy" without being wrong —
  don't flag sheer surface area or unfamiliarity as non-compliance. Every
  finding needs a specific broken rule and file:line evidence, not a vibe.

## When NOT to use this
- Pure review logic with no DB/FS/network belongs in the `reviewer-core` package,
  not a server module.
- One-off scripts and migrations don't need the full layering.
