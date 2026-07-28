# Onion Architecture Review: alerts module

**Module Location:** `modules/alerts/`  
**Review Date:** 2026-07-25  
**Status:** ❌ NON-COMPLIANT — 3 violations found

---

## Violations Found

### 1. Direct Import of Concrete Adapter (Service Layer)

**File:** `service.ts`  
**Line:** 2  
**Violation:**
```ts
import { PagerDutyClient } from '../../adapters/pagerduty/pagerduty-client.js';
```

**Issue:** The service directly imports a concrete adapter class instead of depending on a port interface. Per the skill:
- Services must depend on **port interfaces**, never concrete adapter classes
- The service receives `Container`; it should resolve adapters from the container, not import them directly

**Correct Layer:** The port interface should be defined in `@devdigest/shared` (vendored). The concrete `PagerDutyClient` should live in `adapters/pagerduty/`, and the service should depend on the port interface, not the implementation.

**How to Fix:** Replace the concrete import with a port interface imported from shared, and resolve the adapter off the container.

---

### 2. Direct Adapter Instantiation + Unmediated process.env Access (Service Layer)

**File:** `service.ts`  
**Line:** 15  
**Violation:**
```ts
private pagerDuty = new PagerDutyClient(process.env.PAGERDUTY_ROUTING_KEY ?? '');
```

**Issue:** Two nested violations:

1. **Adapter instantiation in service:** The service directly instantiates `PagerDutyClient` with the `new` keyword. Per the skill: *"Service `new`s an adapter (`new OctokitGitHubClient(...)` inside `service.ts`). → Resolve it off the container; the container owns construction + secrets."*

2. **Direct process.env access:** Reading `process.env.PAGERDUTY_ROUTING_KEY` bypasses the `SecretsProvider`. Per the skill: *"Reading `process.env` in feature code (including inside `platform/container.ts` wiring code). → Secrets via `SecretsProvider`, config via `AppConfig`."* This rule applies everywhere, including in service code.

**Correct Layer:** 
- The PagerDuty port should be resolved from the container (e.g., `this.container.pagerDuty()`)
- Secrets should be accessed via `SecretsProvider` in the composition root (`platform/container.ts`), where the adapter is wired
- The service should never read `process.env` directly

**How to Fix:** 
1. Define a `PagerDutyClient` port interface in shared (e.g., `PagerDutyPort`)
2. In `platform/container.ts`, wire the adapter: 
   ```ts
   get pagerDuty(): PagerDutyClient {
     if (this.overrides.pagerDuty) return this.overrides.pagerDuty;
     this._pagerDuty ??= new PagerDutyClient(this.secrets.get('PAGERDUTY_ROUTING_KEY'));
     return this._pagerDuty;
   }
   ```
3. In service, call `this.container.pagerDuty()` instead of `this.pagerDuty`

---

### 3. No Zod Schema Validation (Transport Layer)

**File:** `routes.ts`  
**Line:** 12  
**Violation:**
```ts
const { repoId, message } = req.body as { repoId: string; message: string };
```

**Issue:** The route uses TypeScript type casting (`as { ... }`) instead of Zod schema validation. Per the skill: *"routes declare Zod `params`/`body` schemas — no hand-rolled `Schema.parse(req.body)`."* Type casting provides no runtime validation; the request body could contain unexpected data.

**Correct Layer:** Transport layer (`routes.ts`) must validate all input using Zod schemas before passing to the service.

**How to Fix:** Define a Zod schema and validate:
```ts
import { z } from 'zod';

const AlertNotifyBody = z.object({
  repoId: z.string(),
  message: z.string(),
});

app.post('/internal/alerts/notify', async (req) => {
  const body = AlertNotifyBody.parse(req.body);
  const { workspaceId } = await getContext(app.container, req);
  await service.notify(workspaceId, body.repoId, body.message);
  return { ok: true };
});
```

---

## Layer Compliance Summary

| Layer | File | Status | Notes |
|---|---|---|---|
| **Domain Core** | (none) | ✓ OK | Module does not define contracts; relies on shared imports |
| **Transport** | `routes.ts` | ❌ FAIL | Missing Zod schema validation; violates input parsing rule |
| **Application** | `service.ts` | ❌ FAIL | Directly imports + instantiates adapter; reads process.env; violates DI principle |
| **Persistence** | `repository.ts` | ✓ OK | Correctly touches only its table; stores workspaceId in values for tenancy |
| **Helpers** | `helpers.ts` | ✓ OK | Pure transform function; appropriate layer |
| **Constants** | `constants.ts` | ✓ OK | Literals only |
| **Composition Root** | (none) | N/A | Container wiring is out of scope for this module |

---

## Summary

The **alerts module is not compliant** with onion architecture. The service layer violates the core dependency-injection principle by directly instantiating a concrete adapter and reading secrets from `process.env`. The transport layer lacks Zod schema validation. All three violations must be fixed before the module can be considered architecturally sound.

The repository and helpers layers are correctly structured and require no changes.
