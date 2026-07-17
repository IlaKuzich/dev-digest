# pr-self-review — Example Report

A branch touching both `client/` and `server/`. Areas detected: Frontend,
Backend, Full-stack. Skills invoked: `next-best-practices`, `react-best-practices`,
`client-project-structure`, `fastify-best-practices`, `onion-architecture`,
`security`, `zod`, `typescript-expert`.

```
## PR Self-Review — 3-pr-self-review-skill
Scope: 5 files · areas: Backend, Frontend, Full-stack
Skills consulted — Backend: fastify-best-practices, drizzle-orm-patterns, onion-architecture; Frontend: next-best-practices, react-best-practices, client-project-structure; Full-stack: security, zod, typescript-expert

### Backend
- [blocker] server/src/modules/pulls/service.ts:37 · onion-architecture —
  service imports `octokit` directly. Fix: inject a GithubPort adapter via the
  container; keep the SDK out of the service layer.
- [warning] server/src/modules/pulls/routes.ts:12 · fastify-best-practices —
  route has no JSON schema for the body. Fix: add a Zod-derived schema so replies
  are validated and serialized.
- [nit] server/src/modules/pulls/repository.ts:24 · drizzle-orm-patterns —
  prefer `db.query.pulls.findMany` over a hand-built select for relations.

### Frontend
- [warning] client/src/app/pulls/_components/pull-list.tsx:18 ·
  client-project-structure — business-logic predicate `isStale()` lives in the
  component. Fix: move it to a page-local `helpers.ts`.
- [nit] client/src/app/pulls/_components/pull-list.tsx:5 · react-best-practices —
  `useEffect` fetch; prefer the TanStack Query hook per the data-fetching rule.

### Full-stack
- [blocker] server/src/modules/pulls/routes.ts:41 · security — repo id from params
  is interpolated into a query string. Fix: use a parameterized Drizzle query.

### Verdict
blockers: 2 · warnings: 2 · nits: 2 → FAIL
```

Verdict `FAIL` (2 blockers) → the state artifact records `verdict: "fail"`,
`blockerCount: 2`, and the push hook denies `git push` until the two blockers are
fixed and the review re-run to `PASS`.
