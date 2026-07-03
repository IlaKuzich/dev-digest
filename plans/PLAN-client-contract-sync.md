# Plan: Client Shared Contract Sync

> Status: DRAFT
> Created: 2026-06-25

## Problem

Клиентские копии shared-контрактов не синхронизированы с серверными после
имплементации Intent Layer. Два расхождения:

1. **`platform.ts`** — `review_intent` дефолт на клиенте: `openai/gpt-4.1`.
   На сервере уже исправлено: `openrouter/deepseek/deepseek-v4-flash`.
   Следствие: Settings UI показывает неверную модель (`gpt-4.1`) пока сервер
   реально запускает DeepSeek Flash.

2. **`trace.ts`** — `PromptAssembly` на клиенте не имеет поля
   `intent: z.string().nullish()`. На сервере поле добавлено в строке 52.
   Следствие: `cd client && pnpm typecheck` упадёт при парсинге `RunTrace`.

## Affected Modules

| Module | Path | Change |
|--------|------|--------|
| client contracts | `client/src/vendor/shared/contracts/platform.ts` | Обновить дефолт `review_intent` |
| client contracts | `client/src/vendor/shared/contracts/trace.ts` | Добавить поле `intent` в `PromptAssembly` |

## Tasks

### TASK-001: Fix `platform.ts` — `review_intent` default

**Owned Path:** `client/src/vendor/shared/contracts/platform.ts`

Строки 56–57. Найти блок `id: 'review_intent'` и изменить:

```typescript
// До:
defaultProvider: 'openai',
defaultModel: 'gpt-4.1',

// После:
defaultProvider: 'openrouter',
defaultModel: 'deepseek/deepseek-v4-flash',
```

**Эффект:** Settings UI сразу покажет `deepseek/deepseek-v4-flash` как дефолт
для "PR Review · Intent" — совпадёт с тем, что сервер реально запускает.

**Acceptance Criteria:**
- [ ] AC-001: Settings → Feature Models → "PR Review · Intent" показывает `deepseek-v4-flash`
- [ ] AC-002: `cd client && pnpm typecheck` не даёт новых ошибок

---

### TASK-002: Fix `trace.ts` — добавить `intent` в `PromptAssembly`

**Owned Path:** `client/src/vendor/shared/contracts/trace.ts`

В объекте `PromptAssembly` (строка 39) добавить поле перед `user: z.string()`:

```typescript
// Сервер (trace.ts строка 51–52):
/** Derived PR intent + scope block; null when not derived. */
intent: z.string().nullish(),
```

```typescript
// Итоговый PromptAssembly на клиенте:
export const PromptAssembly = z.object({
  system: z.string(),
  skills: z.string().nullish(),
  memory: z.string().nullish(),
  specs: z.string().nullish(),
  callers: z.string().nullish(),
  repo_map: z.string().nullish(),
  pr_description: z.string().nullish(),
  /** Derived PR intent + scope block; null when not derived. */
  intent: z.string().nullish(),   // ← добавить
  user: z.string(),
});
```

**Acceptance Criteria:**
- [ ] AC-003: `cd client && pnpm typecheck` проходит без ошибок по `PromptAssembly`

---

## Implementation Order

1. TASK-001 — `platform.ts` (независимая правка, 2 строки)
2. TASK-002 — `trace.ts` (независимая правка, 1 строка)

Оба изменения независимы, можно делать в любом порядке или одним коммитом.

## Verification

```bash
cd client && pnpm typecheck
```

Визуально: перезапустить клиент → Settings → Feature Models →
"PR Review · Intent" должен показывать `deepseek-v4-flash`.

## Out of Scope

- Нет изменений на сервере
- Нет миграций БД
- Нет изменений в UI компонентах
