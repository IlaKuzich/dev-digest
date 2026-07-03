# TODO: додати сканування README з кореня репо

## Що зробити

У `server/src/modules/context/service.ts` метод `walkForContextDirs` зараз знаходить тільки `.md` файли всередині директорій `specs/`, `docs/`, `insights/`.

Потрібно додати збір `README.md` (та інших `.md`) з **кореня репо** і можливо з кореня кожного модуля.

## Варіанти реалізації

**Варіант A — тільки корінь репо:**
У `listDocs(clonePath)` перед `walkForContextDirs` зібрати всі `.md` напряму в `clonePath` (не рекурсивно).

```ts
// У listDocs(), перед walkForContextDirs:
const rootEntries = await readdir(clonePath, { withFileTypes: true });
for (const entry of rootEntries) {
  if (entry.isFile() && entry.name.endsWith(".md")) {
    // зібрати як SpecFile з path = entry.name
  }
}
```

**Варіант B — корінь репо + корінь кожного пакета (monorepo):**
Розширити `CONTEXT_DIR_NAMES` або додати окрему логіку для кореневих `.md` на глибині 0 і 1.

## Що оновити після реалізації

- [ ] `server/src/modules/context/service.ts` — додати логіку
- [ ] `server/src/modules/context/service.test.ts` — додати тест: `README.md` у корені → потрапляє в результат
- [ ] Критерій **#15** у `ai-harness-engineering/homeworks/CRITERIAS/criterias_hw5.md` — оновити формулювання glob-правила
