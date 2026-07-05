# Spec: Context Root Scan | SPEC-2026-07-04-context-root-scan | Status: draft
Supersedes: N/A
Related: [SPEC-2026-07-02-project-context](SPEC-2026-07-02-project-context.md)

## Проблема й навіщо

`ContextService.listDocs()` зараз знаходить `.md`-файли лише всередині тек, буквально названих `specs/`, `docs/` або `insights/` (рекурсивно, через `CONTEXT_DIR_NAMES` + `walkForContextDirs`). Кореневі документи — насамперед `README.md` у корені репо та в корені кожного модуля — ніколи не потрапляють у Project Context picker, хоча саме вони часто є найкориснішим onboarding-документом для репозиторію. Після цієї фічі кореневі та модульні `.md` стають видимими в picker з окремим візуальним бейджем, і їх можна прикріпляти до агентів як контекст нарівні з рештою документів.

## Goals / Non-goals

**Goals:**
- Збирати `.md`-файли, що лежать напряму (depth 0) у корені клону репозиторію
- Збирати `.md`-файли, що лежать напряму (depth 1, non-recursive) всередині кожної top-level директорії клону, трактуючи будь-яку top-level директорію як candidate "module root" (без hardcoded списку модулів)
- Завжди виключати файли `CLAUDE.md` (case-insensitive) з результату, незалежно від розташування
- Ніколи не заходити всередину директорії `.claude/` (defense in depth, окремо від фільтра за іменем файлу)
- Гарантувати відсутність дублікатів: файл, який могли б знайти і старий рекурсивний walk, і новий root/module scan, з'являється рівно один раз
- Дати клієнту 4-й `DocType` (`readme`) з власним кольором бейджа та i18n-міткою, щоб кореневі/модульні docs візуально відрізнялись від документів із теки `insights/`

**Non-goals:**
- `plans/` НЕ додається як recognized context directory — plan-файли лишаються внутрішніми для SDD-пайплайну і не входять у review-context picker
- Зміна Zod-контракту `SpecFile` — нові файли є звичайними елементами того самого `SpecFile[]`, форма не змінюється
- Зміна `readDocsByPaths()` та `reindex()` — вони споживають результат `listDocs()` без модифікацій
- README-only фільтр — збираються будь-які `.md` у корені/модуль-корені, не лише `README.md`
- Рекурсивне сканування module root глибше depth 1 (файл на кшталт `server/sub/note.md` НЕ підбирається новою логікою)
- Точні назви CSS-змінних та тексти копірайту для нового `readme`-бейджа — це деталі імплементації

## User stories

- Як рев'ю-інженер, я хочу бачити `README.md` кореня репо в Project Context picker, щоб прикріпити найкорисніший onboarding-документ як контекст агента
- Як рев'ю-інженер, я хочу бачити `README.md` кожного модуля (`server/README.md`, `client/README.md` тощо), щоб додавати модуль-специфічний контекст
- Як рев'ю-інженер, я хочу, щоб файли `CLAUDE.md` ніколи не з'являлись у picker, бо це інструкції для агента, а не документація проекту
- Як рев'ю-інженер, я хочу, щоб кореневі/модульні docs мали окремий бейдж, а не мовчки маркувались як "insight", щоб я міг відрізнити їх від документів із теки `insights/`

## Acceptance criteria (EARS)

### Reader (сервер — `ContextService.listDocs`)

- **AC-1:** КОЛИ `listDocs` сканує клон, система повинна (shall) додатково до існуючого рекурсивного `specs/docs/insights` walk зібрати всі `.md`-файли, що лежать напряму (depth 0) у корені клону, та повернути їх як елементи того самого `SpecFile[]` (path відносно кореня клону, наприклад `README.md`, `CONTRIBUTING.md`).
  `observable: integration — клон з README.md у корені -> listDocs повертає елемент з path === "README.md"`

- **AC-2:** КОЛИ `listDocs` сканує клон, система повинна (shall) для кожної top-level директорії клону зібрати `.md`-файли, що лежать напряму (depth 1) всередині неї, трактуючи будь-яку top-level директорію як candidate module root (без hardcoded списку на кшталт `["server","client"]`).
  `observable: integration — клон з server/README.md і client/README.md -> listDocs повертає обидва шляхи`

- **AC-3:** ЯКЩО `.md`-файл лежить глибше depth 1 всередині top-level директорії (наприклад `server/sub/note.md`) і не всередині recognized context directory, ТОДІ система повинна (shall) НЕ підбирати його новою root/module-логікою.
  `observable: integration — клон з server/sub/note.md (без specs/docs/insights) -> note.md відсутній у результаті`

- **AC-4:** ЯКЩО ім'я файлу дорівнює `CLAUDE.md` (case-insensitive), ТОДІ система повинна (shall) ніколи не включати цей файл у результат — ні в корені клону, ні всередині будь-якої top-level директорії.
  `observable: integration — клон з CLAUDE.md у корені та server/claude.md -> жоден не потрапляє в результат`

- **AC-5:** Система повинна (shall) додати `.claude` до skip-list директорій (поряд з `node_modules`, `.git`, `.next`, `dist`, `build`) і ніколи не заходити всередину `.claude/` під час будь-якого сканування.
  `observable: integration — клон з .claude/docs/notes.md -> notes.md відсутній у результаті`

- **AC-6:** КОЛИ новий module-root scan обходить top-level директорії, система повинна (shall) пропускати будь-яку top-level директорію, ім'я якої є recognized context directory name (`specs`, `docs`, `insights`), оскільки вона вже повністю оброблена рекурсивним walk; кожен файл повинен (shall) з'являтись у результаті рівно один раз.
  `observable: integration — клон з top-level docs/README.md -> результат містить docs/README.md рівно один раз (без дублікатів)`

### UI (клієнт — `context-utils.ts`)

- **AC-7:** КОЛИ клієнт класифікує шлях документа через `getDocType`, система повинна (shall) повертати `"insight"` лише для шляхів, що містять сегмент `insights`, а для будь-якого шляху, що не відповідає жодній із тек `specs`/`docs`/`insights`, повертати новий 4-й `DocType` `"readme"` (замість поточного fallback у `"insight"`).
  `observable: unit — getDocType("README.md") === "readme"; getDocType("server/README.md") === "readme"; getDocType("insights/gotchas.md") === "insight"`

- **AC-8:** Система повинна (shall) надати окремий колір бейджа для `DocType` `"readme"` у `BADGE_COLORS`, відмінний від кольорів `spec`/`doc`/`insight`.
  `observable: unit — BADGE_COLORS.readme визначений і не дорівнює BADGE_COLORS.insight`

- **AC-9:** Система повинна (shall) надати окрему i18n-мітку для `readme`-бейджа через `DOC_TYPE_I18N` (новий ключ, наприклад `badgeReadme`), і цей ключ повинен (shall) існувати в messages-файлі.
  `observable: unit — DOC_TYPE_I18N.readme визначений; client/messages/en/context.json містить відповідний ключ бейджа`

## Edge cases

- **Кореневий `.md`, що не `README.md` (наприклад `CONTRIBUTING.md`):** підбирається depth-0 скануванням — AC-1 покриває (будь-який `.md`, не лише README)
- **`CLAUDE.md` у корені та в module root:** виключається завжди — AC-4 покриває
- **`.claude/CLAUDE.md` та `.claude/docs/x.md`:** виключається двома незалежними механізмами (skip-dir `.claude` + фільтр за іменем) — AC-5 покриває, defense in depth
- **Top-level директорія `docs/` з файлом `docs/README.md`:** обробляється рекурсивним walk; module-root scan пропускає `docs` як recognized context dir -> рівно один запис — AC-6 покриває
- **Module root без жодного `.md` (наприклад `server/` містить лише код):** новою логікою нічого не додається — accepted (порожній внесок)
- **`.md` глибоко в module root (`server/lib/util/x.md`) поза specs/docs/insights:** не підбирається — AC-3 покриває
- **Порожній клон / клон без документів:** `listDocs` повертає `[]` — незмінна поведінка з батьківського spec
- **Символьні лінки на директорії top-level:** accepted risk — поведінка визначається `readdir(..., { withFileTypes: true })`; окрема обробка symlink не входить у цей spec
- **`.md` у корені, ім'я якого збігається з файлом усередині specs/docs/insights (різні шляхи):** це різні `path`, обидва легітимні, дублікатом не вважаються (дедуплікація стосується лише однакового відносного шляху)

## Data model / Schema

Нових сутностей немає. Використовується існуючий `SpecFile` (`platform.ts:259`): `path`, `content`, `size`, `updated_at`, `estimated_tokens` — без змін контракту. Нові кореневі/модульні файли є звичайними елементами `SpecFile[]` з `path` відносно кореня клону (наприклад `README.md`, `server/README.md`).

Клієнтський тип розширюється:

**`DocType`** (розширення): `"spec" | "doc" | "insight" | "readme"` — додається значення `"readme"`. `BADGE_COLORS` та `DOC_TYPE_I18N` розширюються відповідним записом.

## Workflows

```mermaid
flowchart TD
    Start([listDocs clonePath]) --> Empty{clonePath порожній?}
    Empty -->|так| RetEmpty[повернути []]
    Empty -->|ні| RootMd[Depth 0: зібрати .md у корені клону]
    RootMd --> RootFilter{ім'я == CLAUDE.md?}
    RootFilter -->|так| SkipRoot[пропустити]
    RootFilter -->|ні| AddRoot[додати у SpecFile[]]
    AddRoot --> Walk[Існуючий рекурсивний specs/docs/insights walk]
    SkipRoot --> Walk
    Walk --> TopDirs[Для кожної top-level директорії]
    TopDirs --> IsSkip{у SKIP_DIRS? .git/.claude/node_modules/...}
    IsSkip -->|так| NextDir[наступна директорія]
    IsSkip -->|ні| IsCtx{ім'я в CONTEXT_DIR_NAMES? specs/docs/insights}
    IsCtx -->|так| NextDir
    IsCtx -->|ні| ModMd[Depth 1: зібрати .md напряму, крім CLAUDE.md]
    ModMd --> NextDir
    NextDir --> Done([SpecFile[] без дублікатів])
```

Клієнт: `getDocType(path)` спочатку перевіряє сегмент `specs` -> `spec`, потім `docs` -> `doc`, потім `insights` -> `insight`, інакше -> `readme`. `BADGE_COLORS[docType]` і `DOC_TYPE_I18N[docType]` дають колір і мітку бейджа.

## Service communication

Фіча не додає нових ендпоінтів і не змінює форму відповіді. Змінюється лише внутрішня логіка збору файлів у `ContextService.listDocs`:

- client -> GET /repos/:repoId/context -> server (context module) -> `ContextService.listDocs(clonePath)` -> filesystem (клон)
- Результат `SpecFile[]` тепер додатково містить кореневі та модуль-кореневі `.md`
- client (context-utils) класифікує кожен `path` у `DocType` для вибору бейджа — без звернення до сервера

## Contracts (high-level)

Без змін. Існуючий ендпоінт повертає ту саму форму, лише з додатковими елементами масиву:

```
GET  /repos/:repoId/context          -> 200 SpecFile[]   (тепер може містити README.md, server/README.md, …)
POST /repos/:repoId/context/reindex  -> 200 ContextSummary  (files_count/tokens_total враховують нові файли)
```

## Non-functional

- КОЛИ клон містить top-level директорію з великою кількістю файлів, module-root scan повинен (shall) читати лише вміст цієї директорії на depth 1 (`readdir` без рекурсії) і не обходити її піддерево — щоб не збільшувати складність сканування понад існуючий рекурсивний walk.
- Виключення `CLAUDE.md` повинно (shall) бути case-insensitive (`CLAUDE.md`, `claude.md`, `Claude.md` — усі виключаються).

## Inputs (provenance)

- Кореневі та модуль-кореневі `.md`: [deterministic: filesystem] — `readdir` по клону, без LLM
- `estimated_tokens` для нових файлів: [deterministic: server] — heuristic `Math.ceil(content.length / 4)`, як у існуючих файлів
- `DocType` класифікація: [deterministic: client] — суто за структурою шляху

## Untrusted inputs

Нового untrusted-surface не додається. Вміст нових `.md`-файлів (root/module README) при прикріпленні до агента проходить той самий шлях, що й решта context-документів у [SPEC-2026-07-02-project-context](SPEC-2026-07-02-project-context.md): обгортається `wrapUntrusted()` з delimiter escaping перед вставкою в промпт. Ця фіча стосується лише discovery, не injection.

## Verification hints

- AC-1..AC-6 -> unit test `service.test.ts` (patterns вже є в файлі): створити tmp-клон з відповідною структурою, викликати `listDocs(tempDir)`, перевірити наявність/відсутність очікуваних шляхів та відсутність дублікатів (`paths.filter(p => p === x).length === 1`)
- AC-3 -> unit: `server/sub/note.md` без specs/docs/insights -> перевірити що `note.md` немає в результаті
- AC-4 -> unit: `CLAUDE.md` у корені + `server/claude.md` (lowercase) -> обидва відсутні
- AC-5 -> unit: `.claude/docs/notes.md` -> `notes.md` відсутній (skip-dir спрацьовує до заходу в теку)
- AC-6 -> unit: top-level `docs/README.md` -> рівно один запис `docs/README.md`
- AC-7..AC-9 -> unit test `context-utils.test.ts`: перевірити `getDocType` для readme/insight-кейсів, наявність `BADGE_COLORS.readme` та `DOC_TYPE_I18N.readme`, а також присутність i18n-ключа в `context.json`

## Cleanup

Після імплементації файл `TODO-context-root-scan.md` у корені репо вважається вирішеним і може бути видалений — його зміст повністю покритий цим spec. (Це закриваюча примітка, не формальний AC.)
