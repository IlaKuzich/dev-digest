# Onion Architecture Review: alerts Module

## Summary
The `alerts` module contains **3 critical violations** of the onion-architecture dependency rule and layering principles.

---

## Violations

### VIOLATION 1: Direct instantiation of concrete adapter in service layer
**File:** `service.ts:2, 15`

**Evidence:**
```ts
import { PagerDutyClient } from '../../adapters/pagerduty/pagerduty-client.js';

export class AlertService {
  private pagerDuty = new PagerDutyClient(process.env.PAGERDUTY_ROUTING_KEY ?? '');
```

**Issue:** The service instantiates `PagerDutyClient` directly, violating the dependency rule. Per the skill: *"Services receive `Container`; never instantiate adapters directly."* Concrete adapters are external infrastructure and must be wired in the composition root (`platform/container.ts`), not in the service layer.

**Should be:** 
- Define a `PagerDutyClient` **port interface** in `@devdigest/shared`
- Implement the adapter under `adapters/pagerduty/`
- Wire it in `platform/container.ts` as a lazy getter
- Inject via the container: `await this.container.pagerduty()` or similar

**Layer:** Application → Persistence/Infra (points outward instead of inward)

---

### VIOLATION 2: Reading `process.env` directly in feature code
**File:** `service.ts:15`

**Evidence:**
```ts
private pagerDuty = new PagerDutyClient(process.env.PAGERDUTY_ROUTING_KEY ?? '');
```

**Issue:** Feature code should never read `process.env` directly. Per the skill's common mistakes section: *"Reading `process.env` in feature code."* Secrets must be resolved through `SecretsProvider` passed from the composition root.

**Should be:**
- Secrets are retrieved via `SecretsProvider` in the container
- The adapter receives secrets when wired in the composition root, e.g.:
  ```ts
  get pagerDuty(): PagerDutyClient {
    if (this.overrides.pagerDuty) return this.overrides.pagerDuty;
    const key = this.secrets.get('PAGERDUTY_ROUTING_KEY');
    this._pagerDuty ??= new PagerDutyClient(key);
    return this._pagerDuty;
  }
  ```

**Layer:** Application → Infrastructure (secrets belong in the outer composition root)

---

### VIOLATION 3: Service instantiating repository directly (breaking dependency injection)
**File:** `service.ts:18`

**Evidence:**
```ts
constructor(private container: Container) {
  this.repo = new AlertRepository(container.db);
}
```

**Issue:** The service instantiates its own repository as a direct dependency in the constructor. This breaks the dependency-injection pattern and makes testing harder (cannot mock the repository without deeper refactoring). While repositories are part of the same module, dependencies should flow through the container or be injected as parameters.

**Should be:**
- Either pass the repository as a constructor parameter:
  ```ts
  constructor(private container: Container, private repo: AlertRepository) {}
  ```
- Or resolve it via the container if the container manages module repositories:
  ```ts
  this.repo = this.container.alertRepository
  ```

**Layer:** Application layer (dependency injection pattern violation)

---

## Summary Table

| Line | Violation | Severity | Corrective Layer |
|------|-----------|----------|------------------|
| service.ts:2, 15 | Direct adapter instantiation | Critical | Move to `platform/container.ts`; inject via container |
| service.ts:15 | Direct `process.env` read | Critical | Move to `SecretsProvider` in composition root |
| service.ts:18 | Repository instantiation in constructor | High | Inject as parameter or resolve via container |

---

## Reference
- Skill: `/onion-architecture` — Dependency Rule, Layer Map, Composition Root
- Canonical reference: `modules/repos/` (not available in this fixture, but mentioned in skill)
- Dependency Rule: **routes → service → (ports + repository); adapters implement ports; the container wires them.** Nothing flows the other way.
