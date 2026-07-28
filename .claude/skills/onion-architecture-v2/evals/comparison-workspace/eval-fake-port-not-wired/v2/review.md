# Onion Architecture Review: translations Module

**Module path:** `modules/translations/`  
**Review date:** 2026-07-25  
**Compliance status:** ❌ **VIOLATION FOUND**

---

## Summary

The module exhibits a **Fake DI** violation in the application layer. An interface is declared locally and used to type a directly-instantiated adapter, creating the appearance of dependency injection without the actual substance required by the onion architecture. The dependency rule explicitly forbids this pattern because it prevents external code (tests, alternate implementations, the container) from substituting a different implementation.

---

## Violation Details

### 1. Fake DI: GoogleTranslateAdapter Not Wired Through Container

**File:** `service.ts`  
**Lines:** 5–11  
**Severity:** High

#### Evidence

```typescript
// Lines 5-7: Local interface declaration
interface Translator {
  translate(text: string, targetLang: string): Promise<string>;
}

export class TranslationService {
  private repo: TranslationRepository;
  private translator: Translator = new GoogleTranslateAdapter();  // Line 11: Direct instantiation
```

#### Violation

- **Line 5–7:** A `Translator` port interface is declared **locally within the service**, not in the domain core (`@devdigest/shared`).
- **Line 11:** The `GoogleTranslateAdapter` is directly instantiated with `new GoogleTranslateAdapter()` and assigned to a field typed against the local `Translator` interface.
- **Line 2:** The service imports the concrete adapter class directly: `import { GoogleTranslateAdapter } from '../../adapters/translate/google-translate.js';`

#### Why This Violates the Dependency Rule

From the skill's "Harder cases" section:

> **Fake DI (an interface that was never actually wired).** `service.ts` declares its own local interface and assigns a directly-`new`'d concrete adapter to a field typed against it. Typing against an interface does not by itself satisfy the dependency rule — nothing outside `service.ts` can substitute a different implementation (no container getter, no override slot, no test mock path), so it's the "new`s an adapter" mistake wearing an interface as a costume.

And explicitly:

> **An interface is not DI until something outside the module can substitute a different implementation.** A locally-declared interface backing a directly-`new`'d adapter is decoration, not inversion of control — the container has to be the thing choosing the concrete class.

#### What Should Happen Instead

1. Define the `Translator` port interface in `@devdigest/shared` (the domain core), not locally in the service.
2. Implement `GoogleTranslateAdapter` under `adapters/translate/google-translate.ts` to satisfy the `Translator` interface.
3. Wire the adapter through the composition root (`platform/container.ts`) as a lazy getter:
   ```typescript
   get translator(): Translator {
     if (this.overrides.translator) return this.overrides.translator;
     this._translator ??= new GoogleTranslateAdapter(/* ...config/secrets... */);
     return this._translator;
   }
   ```
4. Add an override slot to `ContainerOverrides` for tests:
   ```typescript
   translator?: Translator;  // in ContainerOverrides
   ```
5. Update the service to request the adapter from the container:
   ```typescript
   async translateDescription(workspaceId: string, prId: string, targetLang: string): Promise<string> {
     const pr = await this.repo.getDescription(workspaceId, prId);
     const translated = await this.container.translator.translate(pr?.description ?? '', targetLang);
     // ...
   }
   ```

#### Consequences of This Violation

- **Untestable:** Unit tests cannot inject a mock `Translator` to verify behavior without hitting the real Google Translate API.
- **Inflexible:** You cannot swap `GoogleTranslateAdapter` for a different implementation (e.g., a local caching adapter, or an alternative translation service) without editing `service.ts`.
- **DI principle broken:** The service instantiates a concrete dependency directly, not through the container, violating the rule that the container is the single place where adapters are chosen and wired.

---

## Other Observations

### Repository Layer (repository.ts)

✅ **Compliant:** The repository correctly implements tenancy guards:

- `getDescription` (line 8): Filters by both `workspaceId` and `prId` via `and(eq(...), eq(...))`.
- `cacheTranslation` (line 16): Includes `workspaceId` in the inserted row, maintaining the tenancy boundary.

### Transport Layer (routes.ts)

✅ **Compliant:**

- Route parses request params and body correctly (no hand-rolled parsing).
- Delegates business logic to the service.
- Returns a DTO (object literal with `text` field) — does not leak Drizzle rows.

### Service: Direct Repository Instantiation (line 14)

⚠️ **Potentially acceptable:** The service instantiates its own repository with `new TranslationRepository(container.db)` rather than requesting it from the container. This is less clear-cut than the adapter issue, as the repository is the module's own persistence layer (not an external port). However, best practice would be to also wire the repository through the container for full testability. The skill does not explicitly forbid services from creating their own repositories, but the established DevDigest pattern prefers container-mediated resolution of all dependencies.

---

## Conclusion

The module is **not compliant** with onion architecture due to the Fake DI violation. The `GoogleTranslateAdapter` must be wired through the container, not instantiated directly within the service. This is a textbook case of the "Harder cases" pattern described in the skill — the code looks almost right (there is an interface, and it is used), but the dependency rule's *intent* is broken because nothing outside the service can provide a different implementation.

**Required fix:** Move the `Translator` interface to the domain core, wire the adapter through the container with an override slot for tests, and update the service to request it from `this.container.translator`.
