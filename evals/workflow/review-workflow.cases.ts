import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 13 Claude sessions total (deliberately kept lean — see below).
 *   - 8 × trace              → 1 session each                      = 8
 *   - 2 × activation pair    (positive + near-miss negative)       = 4
 *   - 1 × activation single (frontend-architecture state placement) = 1
 *
 * Extended from an initial 6-session baseline to close remaining ROOT CLAUDE.md "Read When" gaps
 * (DI/secrets, e2e flows, nested-only server docs) plus one skill-vs-subagent discrimination pair.
 * New cases merge a file-read expectation with a DIFFERENT-kind expectation (dispatch or skill)
 * in the same `trace` session where a natural task combines them — never two file-reads together,
 * per the flakiness note below. One such merge (ui-architecture.md + frontend-architecture skill)
 * proved unreliable twice (0/2 each time) for reasons unrelated to the merge itself — traced to a
 * bug in frontend-architecture's own SKILL.md description — and was split back into two independent
 * cases once the description was fixed, so a skill-activation miss can't hide behind a file-read pass.
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 *
 * This is a trimmed-down baseline, not full coverage of every CLAUDE.md "Read When" row or every
 * skill's activation — kept to 6 sessions on purpose. It covers all three mechanisms at least
 * once (contrast ×3, dispatch ×2 — one combined with contrast, one standalone — activation ×1
 * pair). Additional rows (other Read-When docs, other skills' activation pairs) can be added back
 * in a later round once this baseline is confirmed stable via `pnpm eval:repeat`/`eval:delta`.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
// Reuse the architecture-reviewer agent's existing diff fixture instead of duplicating it.
const CHECKOUT_DIFF = readFileSync(
  join(HERE, "..", "agents", "architecture-reviewer", "fixtures", "checkout-service.diff"),
  "utf8",
);
export const cases: WorkflowCase[] = [
  // --- trace (1 session): CLAUDE.md "Read When" routing + subagent dispatch, together -----------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "API-route task reads api-contracts AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з конвенціями API цього репо. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/docs/api-contracts.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- trace (1 session): two "Read When" rows at once -----------------------------------------
  {
    kind: "trace",
    // Tests the CLAUDE.md "Read When" routing, so the prompt must push toward CONSULTING the docs,
    // not exploring source. Earlier phrasing ("розберись, як усе влаштовано") sent the model straight
    // into schema.ts / pipeline.run.ts and it never opened the routed doc. One anchor doc (pipeline.md)
    // keeps this a deterministic routing check — asserting two docs in one session is inherently flaky.
    name: "pipeline task follows CLAUDE.md routing to pipeline.md",
    prompt:
      "Я збираюся змінити review pipeline. Перш ніж торкатися коду — звірся з настановами цього репо " +
      "(CLAUDE.md) щодо того, яку документацію треба прочитати для змін у pipeline, і прочитай саме ці документи.",
    expectFilesRead: ["reviewer-core/docs/pipeline.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "Hit unexpected behavior" routing -> gotchas ----------------
  // Was a contrast case, but the control run (empty tmpdir) could still reach the real repo by
  // absolute path and read gotchas.md, making the negative flaky. As a single-session trace it
  // reliably checks the same routing rule: in the real repo, the discovery prompt reads gotchas.md.
  {
    kind: "trace",
    name: "CLAUDE.md routes a gotchas lookup to reviewer-core/insights",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/insights/gotchas.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 7,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 7,
  },

  // --- trace (1 session): dispatch routing -> architecture-reviewer subagent ---------------------
  // Reuses the architecture-reviewer agent's own eval fixture (checkout-service.diff) instead of
  // writing a new diff — same diff, different question (does the harness dispatch the subagent).
  {
    kind: "trace",
    name: "architecture audit request dispatches architecture-reviewer",
    prompt:
      `Проведи архітектурний аудит цього diff проти onion-контрактів репо. ОБОВʼЯЗКОВО запусти для ` +
      `цього субагента architecture-reviewer — не рецензуй сам.\n\n${CHECKOUT_DIFF}`,
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- trace (1 session): DI/secrets routing + subagent dispatch, together -----------------------
  // Merges what would otherwise be two separate cases (a file-read check for the "Changing DI
  // wiring, adapters, or secrets" CLAUDE.md row, and a dispatch check) into one session, the same
  // way the very first case above merges api-contracts routing with dispatch.
  {
    kind: "trace",
    name: "new adapter with a secret reads architecture.md AND pulls the architecture-reviewer",
    prompt:
      "Хочу додати НОВИЙ адаптер у server/src/adapters/, який зберігає і використовує секретний API-ключ, " +
      "і підключити його через DI-контейнер. Перш ніж писати код, звірся з конвенціями цього репо щодо DI " +
      "та секретів. Потім ОБОВʼЯЗКОВО запусти сабагента architecture-reviewer, щоб він оцінив мій план — " +
      "не рецензуй сам.",
    expectFilesRead: ["server/docs/architecture.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md routing -> ui-architecture.md (single anchor, reliable) -------
  // Split off from a merged file+skill case (see below) once the merge proved unreliable — this
  // half only ever asserted the file read, which passed 2/2 every time.
  {
    kind: "trace",
    name: "UI task follows CLAUDE.md routing to ui-architecture.md",
    prompt:
      "Працюю в client/. Додаю новий компонент і хочу звіритись з конвенціями репо, чи він має бути " +
      "Server чи Client Component.",
    expectFilesRead: ["client/docs/ui-architecture.md"],
    maxTurns: 6,
  },

  // --- activation (1 session): frontend-architecture on a state-placement decision -----------------
  // Third revision. v1 (merged with the trace case, "where do utils go") and v2 (state-placement,
  // but naming FilterBar/PullsList/PullsSummary) both failed 0/2. v2's root cause wasn't the SKILL.md
  // description (fixed regardless — it had a real self-contradiction, see below) but the PROMPT: it
  // named "FilterBar", which turns out to be a REAL existing component
  // (client/src/app/repos/[repoId]/pulls/_components/FilterBar/FilterBar.tsx) — the model read the
  // real file and answered from precedent instead of reasoning abstractly, so the skill never fired.
  // v3 drops every concrete name/route so there is nothing real to go look up.
  // (Unrelated SKILL.md fix kept: description listed "state colocation" as covered but "state
  // management APIs" as NOT covered — redirecting to react-best-practices, whose own description also
  // claims "state management" — and had zero state-related TRIGGER phrases. Now says state PLACEMENT
  // vs state API usage, with state trigger phrases added.)
  {
    kind: "activation",
    name: "frontend-architecture activates on an abstract state-placement decision",
    prompt:
      "Уявімо (без прив'язки до конкретної існуючої сторінки чи компонента): три React-компоненти під " +
      "одним батьківським роутом мають ділити один спільний UI-стан (наприклад, вибрана вкладка), який " +
      "не має переживати навігацію на іншу сторінку і не потрібен глобально застосунку. Яким механізмом " +
      "його реалізувати за конвенціями цього проєкту (local state / prop drilling / Context / Zustand) " +
      "і чому?",
    skill: "frontend-architecture",
    shouldActivate: true,
    maxTurns: 6,
  },

  // --- trace (1 session): CLAUDE.md nested-only routing -> server/specs/review-flow.md -----------
  // review-flow.md isn't mentioned anywhere in the ROOT CLAUDE.md — only in server/CLAUDE.md's own
  // "Read When" table. Passing proves nested module CLAUDE.md files are actually consulted, not just
  // the root one. Kept to a single anchor doc (see the pipeline.md case above) for reliability.
  {
    kind: "trace",
    name: "server task follows nested CLAUDE.md routing to review-flow.md",
    prompt:
      "Працюю в server/. Перш ніж міняти щось у циклі ревʼю PR, хочу простежити повний review lifecycle " +
      "за конвенціями цього модуля — звірся з відповідними настановами репо і прочитай потрібний документ.",
    expectFilesRead: ["server/specs/review-flow.md"],
    maxTurns: 6,
  },

  // --- trace (1 session): CLAUDE.md routing -> e2e/docs/flows.md ---------------------------------
  {
    kind: "trace",
    name: "e2e task follows CLAUDE.md routing to e2e/docs/flows.md",
    prompt:
      "Пишу новий e2e-тест (agent-browser) на flow ревʼю PR. Перш ніж писати сценарій, звірся з " +
      "конвенціями цього репо щодо e2e-флоу і прочитай відповідний документ.",
    expectFilesRead: ["e2e/docs/flows.md"],
    maxTurns: 6,
  },

  // --- activation pair (2 sessions): onion-architecture skill vs architecture-reviewer subagent ---
  // Both mechanisms talk about layering, so it's easy to conflate. Confirms a routine "where does
  // this go" question activates the SKILL (in-conversation guidance), while an explicit full-audit
  // request does not — it should route to the heavier subagent dispatch instead (already covered by
  // the dispatch case above, reusing the same CHECKOUT_DIFF fixture).
  {
    kind: "activation",
    name: "onion-architecture activates on a routine layering placement question",
    prompt:
      "Я додаю нову бізнес-логіку для перевірки ліміту ревʼю по репозиторію — куди в структурі server/ " +
      "її класти: у service.ts, у repository.ts, чи окремий домен-обʼєкт?",
    skill: "onion-architecture",
    shouldActivate: true,
    maxTurns: 6,
  },
  {
    kind: "activation",
    name: "near-miss negative — an explicit full audit request does not activate the skill directly",
    prompt:
      `Проведи повний архітектурний аудит цього diff проти onion-контрактів репо, з детальним звітом ` +
      `по CRITICAL/HIGH/MEDIUM/LOW.\n\n${CHECKOUT_DIFF}`,
    skill: "onion-architecture",
    shouldActivate: false,
    maxTurns: 8,
  },
];
