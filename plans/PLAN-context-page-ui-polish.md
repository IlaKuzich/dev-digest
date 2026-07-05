# Plan: Project Context Page — UI Polish

> Status: DRAFT
> Created: 2026-07-03
> Spec: specs/SPEC-2026-07-02-project-context.md
> Execution Mode: single-agent (frontend-only, no backend changes)

## Requirements (VRF)
> Status: Confirmed

| ID | Requirement | Source |
|----|------------|--------|
| R1 | Toolbar з 4 іконками над списком файлів: ↻ Reindex, ↑ Download, + Add (stub), 📁 Folder (stub) | Design mockup + SPEC AC-3 |
| R2 | Кнопка Reindex переноситься з футера в тулбар як іконка; футер стає display-only | Design mockup |
| R3 | Центральна панель показує хедер з табами Preview \| Edit (Edit = disabled stub) | Design mockup |
| R4 | Хедер центральної панелі містить "Used by 3 agents" бейдж та Coverage ring (обидва hardcoded) | Design mockup |
| R5 | ↑ Download скачує виділений .md файл через `<a download>` | Design mockup |
| R6 | Всі нові UI-рядки через `useTranslations("context")` — без hardcoded English в JSX | client/CLAUDE.md |

## Open Questions & Recommendations

| # | Question | Answer | Type |
|---|----------|--------|------|
| Q1 | "Used by N agents" — реальні дані з БД? | Ні, hardcoded stub = 3. Реальний запит у окремому плані | gap |
| Q2 | Coverage — що рахує? | Не визначено. Hardcoded stub = 78%. Дефініція відкладена | 🚩 red flag |
| Q3 | Edit mode — реалізувати? | Ні. Out of scope per spec ("read-only preview only"). Таб = disabled | gap |
| Q4 | Icons — яка бібліотека? | `@devdigest/ui` — вже використовується на сторінці | 💡 recommendation |

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| frontend: project-context page | `client/src/app/repos/[repoId]/project-context/page.tsx` | Modify |
| frontend: ContextStatusFooter | `client/src/components/context/ContextStatusFooter.tsx` | Modify |
| frontend: ContextDocPreview | `client/src/components/context/ContextDocPreview.tsx` | Modify |
| frontend: i18n | `client/messages/en/context.json` | Modify |

## Tasks

### TASK-001: Toolbar + Reindex icon + Download

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/project-context/page.tsx`
- `client/src/components/context/ContextStatusFooter.tsx`
- `client/messages/en/context.json`

**Acceptance Criteria:**
- [ ] AC-001: Над списком файлів відображається рядок з 4 іконками: Plus, Folder, Download, RefreshCw
- [ ] AC-002: Клік на RefreshCw викликає `handleReindex()` та показує Loader2 spinner під час `isReindexing`
- [ ] AC-003: Plus і Folder задизейблені з `title` "Coming soon"
- [ ] AC-004: Download активний тільки коли файл вибраний; клік → `<a href=... download>` завантажує .md
- [ ] AC-005: Кнопка Reindex видалена з `ContextStatusFooter`; футер показує лише статусний рядок
- [ ] AC-006: Props `onReindex` і `isReindexing` видалені з `ContextStatusFooter`

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-001 | Відкрити `/repos/:id/project-context` → видно 4 іконки над списком |
| AC-002 | Клік ↻ → список оновлюється; іконка крутиться під час завантаження |
| AC-003 | Hover на + і 📁 → tooltip "Coming soon"; клік нічого не робить |
| AC-004 | Вибрати файл → ↑ активна; клік → браузер завантажує .md |
| AC-005 | Футер не містить кнопки; тільки "● N documents · X tokens" |
| AC-006 | `cd client && pnpm typecheck` → 0 errors |

---

### TASK-002: Preview/Edit таби + "Used by N agents" + Coverage ring

**Scope:** frontend

**Owned Paths:**
- `client/src/components/context/ContextDocPreview.tsx`
- `client/messages/en/context.json`

**Acceptance Criteria:**
- [ ] AC-007: Коли файл вибраний — центральна панель показує хедер-рядок
- [ ] AC-008: Хедер містить ім'я файлу зліва, таби Preview | Edit праворуч від імені
- [ ] AC-009: Preview таб завжди активний; Edit таб задизейблений з `title="Coming soon"`
- [ ] AC-010: Хедер справа містить "Used by 3 agents" текст (hardcoded)
- [ ] AC-011: Хедер справа містить SVG Coverage ring — 78% (hardcoded), donut стиль, ~40×40px, без бібліотек
- [ ] AC-012: `useState<"preview">("preview")` — Edit ніколи не активується

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-007 | Клік на файл → хедер з'являється над markdown |
| AC-008–009 | Таби видно; клік на Edit нічого не змінює |
| AC-010 | "Used by 3 agents" видно в правому кутку хедера |
| AC-011 | SVG ring з "78%" видно; перевірити DevTools → `<circle>` елементи |
| AC-012 | `cd client && pnpm typecheck` → 0 errors |

---

## Implementation Phases

> ⚙️ Execution mode: **single-agent** (обидва таски — frontend, один агент послідовно)

### Phase 1: i18n keys
- [ ] Додати ключі `page.toolbar.*` і `page.preview.*` в `client/messages/en/context.json`

### Phase 2: Toolbar (TASK-001)
- [ ] `ContextStatusFooter.tsx` — прибрати `<button>` і props `onReindex`, `isReindexing`
- [ ] `page.tsx` — додати toolbar рядок з 4 іконками; прибрати видалені props з `<ContextStatusFooter>`

### Phase 3: Preview/Edit + stubs (TASK-002)
- [ ] `ContextDocPreview.tsx` — додати хедер з табами, "Used by 3 agents", Coverage ring SVG

### Phase 4: Typecheck
- [ ] `cd client && pnpm typecheck` → 0 errors

## Local Testing Setup

Клон на `cd5ee84` не містить нових файлів (незакомічені зміни). Для тестування переключити `clone_path`:

```bash
docker exec devdigest-postgres psql -U devdigest devdigest -c "
UPDATE repos
SET clone_path = '/Users/oleksandr_yudaiev/Coding/Projects/Rituals/ai-harness-engineering/dev-digest'
WHERE full_name = 'yudbox/dev-digest';
"
```

Після тестування — відкатити на:
`/Users/oleksandr_yudaiev/.../server/clones/yudbox/dev-digest`

> Постійне рішення: commit + push → polling підтягне клон автоматично.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SVG Coverage ring ламає layout | Обгорнути в `flexShrink: 0`, фіксований розмір 40×40 |
| Видалення props з Footer ламає call site | Typecheck після кожного кроку |
| Download не працює для великих файлів | `<a href="data:...">` для малих файлів достатньо; blob URL якщо >1MB |

## Out of Scope
- Реальний підрахунок "Used by N agents" з БД
- Реальна Coverage метрика (визначення відкладено)
- Edit mode (out of scope per spec)
- `+` та `📁` функціональність (file creation, OS file picker)
- repo-scoped agents/skills (окремий план)

## Architecture Notes
- Іконки: `Icon.*` з `@devdigest/ui` — перевірити наявність `Plus`, `Folder`, `Download`, `RefreshCw`, `Loader2`
- Coverage ring: чистий SVG `stroke-dashoffset = circumference * (1 - pct/100)` — без бібліотек
- Download: `URL.createObjectURL(new Blob([content], {type: 'text/markdown'}))` → програмний клік → `URL.revokeObjectURL`
