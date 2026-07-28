# Onion Architecture Review: SMS Module

**Module**: `modules/sms/`  
**Review Date**: 2026-07-25  
**Compliance Status**: ⛔ MULTIPLE VIOLATIONS

---

## Violations Found

### 1. CRITICAL: Direct `process.env` Access in Wiring Code (wiring.ts:6)

**File**: `/Users/kyrylo.bogdanov/course_materials/dev-digest/.claude/skills/onion-architecture-v2/evals/fixtures/08-container-secret-bypass/modules/sms/wiring.ts`  
**Lines**: 6  
**Severity**: CRITICAL

```typescript
export function getSmsAdapter(): TwilioClient {
  cached ??= new TwilioClient(process.env.TWILIO_AUTH_TOKEN ?? '', process.env.TWILIO_ACCOUNT_SID ?? '');
  return cached;
}
```

**Violation**: Reading secrets directly from `process.env` instead of resolving via `SecretsProvider`.

**Rule Violated**: Per SKILL.md section "Adding an external integration":
> "Wire it in the **composition root** `platform/container.ts` as a lazy getter, resolving secrets via `SecretsProvider` (never `process.env`) — **this rule applies inside `container.ts` itself, not just in `service.ts`.**"

Also from "Common mistakes":
> "Reading `process.env` in feature code (including inside `platform/container.ts` wiring code). → Secrets via `SecretsProvider`, config via `AppConfig`."

**Why This Breaks the Dependency Rule**: The container (or container-level wiring) is the composition root where the system's only secrets resolution should happen. Bypassing `SecretsProvider` here means:
- Secrets are read imperatively instead of being managed declaratively
- Tests cannot inject mock secrets for hermetic testing
- Deployment configurations cannot use the application's secret management strategy
- The outer layer (infrastructure) is not owning secret resolution; it's being leaked into construction code

---

### 2. HIGH: Service Directly Calls Adapter Construction (service.ts:13)

**File**: `/Users/kyrylo.bogdanov/course_materials/dev-digest/.claude/skills/onion-architecture-v2/evals/fixtures/08-container-secret-bypass/modules/sms/service.ts`  
**Lines**: 13  
**Severity**: HIGH

```typescript
async send(workspaceId: string, phone: string, body: string): Promise<void> {
  await getSmsAdapter().send(phone, body);
  await this.repo.logSend(workspaceId, phone);
}
```

**Violation**: Service calls `getSmsAdapter()` directly instead of resolving the SMS adapter (a port interface) through the container.

**Rule Violated**: Per SKILL.md "The Dependency Rule":
> "The dependency rule in one line: **routes → service → (ports + repository); adapters _implement_ ports; the container wires them.** Nothing flows the other way."

And from "Common mistakes":
> "Service `new`s an adapter (`new OctokitGitHubClient(...)` inside `service.ts`). → Resolve it off the container; the container owns construction + secrets."

**Why This Breaks the Dependency Rule**: The service bypasses dependency injection entirely:
- The service directly calls a construction function instead of receiving the adapter from the container
- No external code (e.g., tests) can substitute a mock SMS adapter
- The service is tightly coupled to the `wiring.ts` module's implementation details
- The container has lost control over the adapter lifecycle and configuration

**Correct Pattern**: Service should receive the SMS adapter from the container:
```typescript
async send(workspaceId: string, phone: string, body: string): Promise<void> {
  await this.container.sms.send(phone, body);  // or similar port interface
  await this.repo.logSend(workspaceId, phone);
}
```

---

### 3. HIGH: Service Imports Adapter Construction Code (service.ts:3)

**File**: `/Users/kyrylo.bogdanov/course_materials/dev-digest/.claude/skills/onion-architecture-v2/evals/fixtures/08-container-secret-bypass/modules/sms/service.ts`  
**Lines**: 3  
**Severity**: HIGH

```typescript
import { getSmsAdapter } from './wiring.js';
```

**Violation**: Service imports adapter construction code (`getSmsAdapter`) instead of depending only on port interfaces and the container.

**Rule Violated**: Per SKILL.md "Layer map" — Application layer "May import":
> "ports, own repository, contracts, platform errors"

The service does NOT list "adapter construction functions" as a valid import. It should import:
- Port interfaces (from shared)
- Its own repository
- Zod contracts
- The Container type (to access ports via DI)

**Why This Breaks the Dependency Rule**: This creates explicit coupling between the service and the adapter's construction code:
- The service now has a dependency on `wiring.ts`, making them a single unit
- Any changes to how the SMS adapter is constructed affect the service
- The separation of concerns between application logic and infrastructure composition is violated

---

## Summary Table

| Violation | File | Line(s) | Category | Severity |
|-----------|------|---------|----------|----------|
| Direct `process.env` read for secrets | wiring.ts | 6 | Container/Composition Root | CRITICAL |
| Direct adapter construction call | service.ts | 13 | Dependency Injection | HIGH |
| Service imports adapter construction code | service.ts | 3 | Import Dependencies | HIGH |

---

## Corrective Actions Required

1. **Move secret resolution to the container** (platform/container.ts):
   - Inject a `SecretsProvider` parameter into the wiring code
   - Fetch `TWILIO_AUTH_TOKEN` and `TWILIO_ACCOUNT_SID` via `await secretsProvider.get('TWILIO_AUTH_TOKEN')` etc.
   - Store the adapter on the container as a lazy getter property

2. **Service should depend on the container**:
   - Remove the `getSmsAdapter` import from service.ts
   - Change service to access the SMS adapter via the container: `this.container.sms.send(...)`
   - The container exposes the adapter through a typed port interface property

3. **Define a port interface** (if not already in shared):
   - Create an `SmsClient` interface in `@devdigest/shared`
   - TwilioClient should implement this interface
   - Service depends on the port interface type, not the concrete class

---

## Files Reviewed

- ✓ routes.ts — No violations found (correctly delegates to service with container)
- ⛔ service.ts — 2 violations (imports wiring code, calls getSmsAdapter directly)
- ✓ repository.ts — No violations found (correctly scoped to DB operations)
- ⛔ wiring.ts — 1 violation (reads process.env directly for secrets)
- ✓ constants.ts — No violations found (pure literal exports)
