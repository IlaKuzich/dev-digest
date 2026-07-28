# Onion Architecture Review: `modules/translations/`

## Compliance Status: **VIOLATIONS FOUND**

The module violates the core dependency rule: **services must not instantiate concrete adapters directly; all adapters must be wired through the Container as port interfaces.**

---

## Violations

### 1. Direct Import of Concrete Adapter (service.ts:2)

**File:** `service.ts`  
**Line:** 2  
**Violation:**
```ts
import { GoogleTranslateAdapter } from '../../adapters/translate/google-translate.js';
```

**Issue:** The service imports a concrete adapter class instead of a port interface. According to the skill:
- "Service depends on **port interfaces**, never concrete adapter classes."
- Port interfaces should live in `@devdigest/shared` (the domain core), not be imported from adapters.

**Expected:** The service should import a port interface (e.g., `Translator`) from the domain core, not the concrete implementation.

---

### 2. Direct Instantiation of Adapter (service.ts:11)

**File:** `service.ts`  
**Line:** 11  
**Violation:**
```ts
private translator: Translator = new GoogleTranslateAdapter();
```

**Issue:** The service directly instantiates the adapter (`new GoogleTranslateAdapter()`) instead of resolving it from the Container. This violates:
- **Server CLAUDE.md rule:** "Services receive `Container`; never instantiate adapters directly."
- **Skill section "Common mistakes":** "Service `new`s an adapter (`new OctokitGitHubClient(...)` inside `service.ts`). → Resolve it off the container; the container owns construction + secrets."
- **Dependency rule:** The composition root (`platform/container.ts`) is the **only place** where concrete adapters are wired to interfaces.

**What's happening (anti-pattern):**
- The service declares a local `Translator` interface (lines 5–7) but it's not a port from the domain core.
- The concrete adapter is hardcoded into the service, making it impossible to:
  - Swap implementations without editing the service.
  - Mock the translator in tests.
  - Override adapters at runtime.
- The adapter's secrets/config are never resolved through `SecretsProvider` or `AppConfig`.

**Expected behavior:**
1. Define a `Translator` port interface in `@devdigest/shared`.
2. Wire the concrete adapter in `platform/container.ts` as a lazy getter:
   ```ts
   get translator(): Translator {
     if (this.overrides.translator) return this.overrides.translator;
     this._translator ??= new GoogleTranslateAdapter(/* secrets from SecretsProvider */);
     return this._translator;
   }
   ```
3. In the service, resolve the adapter from the container:
   ```ts
   async translateDescription(...) {
     const translated = await this.container.translator.translate(...);
     // ...
   }
   ```
4. Add an override slot to `ContainerOverrides` for test injection:
   ```ts
   translator?: Translator;
   ```

---

## Architecture Diagram: Current (Broken)

```
routes.ts
  ↓ delegates to
service.ts
  ├→ imports GoogleTranslateAdapter (VIOLATION: direct concrete import)
  └→ instantiates new GoogleTranslateAdapter() (VIOLATION: hardcoded instantiation)
       ↓
     GoogleTranslateAdapter (adapter code directly wired, bypassing container)
```

**Problem:** Dependencies point outward (service → adapter), inverting the rule. The adapter is not a pluggable port; it's hardcoded.

---

## Architecture Diagram: Expected (Fixed)

```
routes.ts
  ↓ delegates to
service.ts (depends on port interface only)
  ↓ asks container for
platform/container.ts (composition root)
  ├→ wires Translator port → GoogleTranslateAdapter
  └→ resolves secrets via SecretsProvider
       ↓
    GoogleTranslateAdapter (concrete adapter, controlled by container)

@devdigest/shared (domain core)
  └→ Translator (port interface, zero knowledge of adapters)
```

**Expected:** Dependencies point inward. Service knows only the port interface. Container owns all adapter wiring.

---

## Checklist for Fix

- [ ] Move `Translator` interface to `@devdigest/shared`.
- [ ] Remove direct `GoogleTranslateAdapter` import from `service.ts`.
- [ ] Remove `private translator = new GoogleTranslateAdapter()` from `service.ts`.
- [ ] Add a `translator` getter to `Container` in `platform/container.ts` (lazy-initialized, wired via `SecretsProvider`).
- [ ] Add `translator?: Translator` override slot to `ContainerOverrides`.
- [ ] Update `service.ts` to call `this.container.translator.translate(...)` instead of `this.translator.translate(...)`.
- [ ] Add unit test that injects a mock translator via `container.overrides.translator`.

---

## References

- **Skill:** "Service depends on **port interfaces**, never concrete adapter classes."
- **Skill - Common mistakes:** "Service `new`s an adapter... Resolve it off the container; the container owns construction + secrets."
- **Skill - Layer map:** Application layer "May import" — `ports`, own `repository`, `contracts`, `platform errors`. (NOT adapters.)
- **Skill - Composition root:** "Wires concrete adapters → port interfaces, lazily; override-able in tests."
