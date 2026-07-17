# CLAUDE.md — @devdigest/web (client)

## Before answering
You MUST search this package's `docs/`, `specs/`, and `INSIGHTS.md` for context relevant to the user's current prompt before responding. Pull in only what is relevant; if nothing applies, proceed without it. Treat `INSIGHTS.md` as a curated learning log — read it every turn.

## Stack
- Next.js 15.1 (App Router) · React 19
- TanStack Query 5 · next-intl 3 · Tailwind CSS 4
- recharts · mermaid · react-markdown · lucide-react
- vitest 2 + jsdom 25 + React Testing Library 16

## Commands
- `pnpm dev`        — web on :3000
- `pnpm build` / `pnpm start`
- `pnpm test`       — vitest + jsdom (fetch mocked; no API needed)
- `pnpm typecheck`

## Where things live (top-level map)
- Routes (App Router) → `src/app/**/page.tsx`
- Data hooks (one per query) → `src/lib/hooks/*`
- API client (base = `NEXT_PUBLIC_API_BASE`) → `src/lib/api.ts`
- Page-local feature code → `_components/<Name>/` next to the page
- App chrome (nav, breadcrumbs, shortcuts) → `src/components/app-shell/`
- UI primitives (vendored) → `src/vendor/ui/` (`@devdigest/ui`)
- Shared Zod contracts (vendored copy) → `src/vendor/shared/` (`@devdigest/shared`)
- i18n messages → `messages/<locale>/*.json`

## Non-default conventions
- ALL server state goes through TanStack Query hooks — never `fetch` from a component
- App Router only — there is NO `/pages` directory
- Tests are hermetic: `fetch` is mocked in `src/test/setup.ts`; no API or browser needed
- UI primitives are vendored (`src/vendor/ui`) — treat as a sealed package, use public exports only
- `g`-then-key shortcuts are global; defined in `src/components/app-shell/hooks/`

## Do-not-touch zones
- Don't add a `/pages` directory (App Router only)
- Don't import the API client directly from components — always go through a hook
- Don't reach into `src/vendor/ui/` internals — use the public exports only
- Don't add business logic in `src/vendor/ui/` (it's a vendored design-system copy)

## Read when
- Read [README.md](./README.md) **when** unsure where a route or component lives — has the UI route map and API hook map.
- Read [docs/](./docs/) **when** you need a deep dive (data-flow patterns, design tokens, …).
- Read [specs/](./specs/) **when** changing a contract or proposing a new one.
- Read [src/vendor/ui/README.md](./src/vendor/ui/README.md) **when** touching the vendored primitives — has the "no app imports" rule and primitive catalog.
- Invoke skill `client-project-structure` **when** deciding where a component/hook/helper/constant/type/business-logic belongs, or naming files/folders (page-local `_components` vs shared `lib`/`components`).
- Invoke skill `next-best-practices` **when** changing routes/RSC boundaries; `react-best-practices` **when** changing components; `react-testing-library` **when** writing component tests; `zod` **when** defining contracts.
