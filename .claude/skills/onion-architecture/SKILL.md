---
name: onion-architecture
description: "Use when adding or refactoring a DevDigest server feature module (server/src/modules/<name>) — creating routes/service/repository, deciding where business logic, persistence, or an external integration belongs, wiring a new adapter through the DI container, or keeping the domain core free of DB/HTTP/SDK concerns. Trigger terms: onion architecture, layering, ports and adapters, dependency rule, composition root, container, adapter, repository layer, where does this code go."
metadata:
  tags: onion-architecture, ports-and-adapters, layering, dependency-injection, backend, server, modules
---

# Onion Architecture (DevDigest server)

## Overview
The `server/` package is an onion: **dependencies point inward only.** The pure
domain core (Zod contracts + port interfaces) knows nothing about Postgres,
Fastify, or vendor SDKs. Outer layers depend on inner ones through interfaces;
the composition root (`platform/container.ts`) is the single place where
concrete adapters are wired to those interfaces.

This is a **pattern skill** — adapt it to the feature, but never invert the
dependency rule. Violating the letter (a `service.ts` importing `octokit`, a
`repository.ts` exposing a Drizzle row to a route) violates the spirit.

## Layer map (outer → inner)

| Layer | Lives in | Role | May import |
|---|---|---|---|
| **Transport** (primary adapter) | `modules/<name>/routes.ts` | Fastify + Zod: parse request, map status codes, delegate | service, `_shared/context`, contracts |
| **Application** (use case) | `modules/<name>/service.ts` (+ `helpers.ts`, `constants.ts`) | Business logic, orchestration; receives `Container` | ports, own repository, contracts, platform errors |
| **Persistence / Infra** (secondary adapters) | `modules/<name>/repository.ts`, `adapters/<port>/*` | The only code touching a DB table or a vendor SDK | `db/client`, `db/schema`, the port it implements |
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
- **service** calls ports off the container (`this.container.git`, `await this.container.github()`, `this.container.jobs.enqueue(...)`) and its own `repository`.
- **repository** returns rows; **helpers** map rows → contract DTOs.

Reference implementation to copy: `modules/repos/` (`routes.ts` → `service.ts` → `repository.ts` → `helpers.ts`).

## Adding an external integration (a new port + adapter)
1. Define the **port interface** in `@devdigest/shared` (and re-vendor). It speaks
   the domain's language, not the vendor's.
2. Implement the **adapter** under `adapters/<port>/<impl>.ts` (e.g.
   `adapters/github/octokit.ts` implements `GitHubClient`).
3. Wire it in the **composition root** `platform/container.ts` as a lazy getter,
   resolving secrets via `SecretsProvider` (never `process.env`):
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
| Business rule / orchestration / job handler | `service.ts` |
| SQL / Drizzle query | `repository.ts` |
| Pure transform, URL parse, row→DTO map | `helpers.ts` |
| Call to GitHub/LLM/git/filesystem | a **port** (interface in shared) + **adapter** in `adapters/` |
| Wiring a concrete impl to an interface | `platform/container.ts` |
| A Zod contract / shared type / port interface | `@devdigest/shared` |

## Common mistakes
- **Service `new`s an adapter** (`new OctokitGitHubClient(...)` inside `service.ts`).
  → Resolve it off the container; the container owns construction + secrets.
- **Route contains business logic** (loops, branching on domain state).
  → Move it to the service; routes only parse, delegate, and map status.
- **Repository leaks Drizzle rows to the client.** → Map to a contract DTO first.
- **Cross-module reach-in** (importing another module's `repository.ts`).
  → Share cross-cutting repos via the container (`container.reviewRepo`), and
  cross-package code only through `@devdigest/shared`.
- **Domain core importing infra** (a contract file importing `drizzle`/`fastify`).
  → The core must stay pure; push the dependency outward to an adapter.
- **Reading `process.env` in feature code.** → Secrets via `SecretsProvider`, config via `AppConfig`.

## When NOT to use this
- Pure review logic with no DB/FS/network belongs in the `reviewer-core` package,
  not a server module.
- One-off scripts and migrations don't need the full layering.
