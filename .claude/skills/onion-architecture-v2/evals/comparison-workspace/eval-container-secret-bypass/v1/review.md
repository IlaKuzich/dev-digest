# Onion-Architecture Review: SMS Module
**Status:** ❌ **VIOLATIONS FOUND**

## Summary
The SMS module violates core onion-architecture dependency rules in three critical ways:
1. Direct `process.env` reads for secrets (bypasses `SecretsProvider`)
2. Adapter construction in module-level `wiring.ts` instead of composition root
3. Service directly calls a module-level adapter function instead of resolving through the container

---

## Violations

### 1. Direct `process.env` reads for secrets
**File:** `wiring.ts:6`
```ts
export function getSmsAdapter(): TwilioClient {
  cached ??= new TwilioClient(
    process.env.TWILIO_AUTH_TOKEN ?? '',      // ❌ VIOLATION
    process.env.TWILIO_ACCOUNT_SID ?? ''       // ❌ VIOLATION
  );
  return cached;
}
```

**Rule violated:** Per skill section "Common mistakes":
> *Reading `process.env` in feature code. → Secrets via `SecretsProvider`, config via `AppConfig`.*

**Expected pattern:** Secrets resolution must happen in the composition root (`platform/container.ts`) via `SecretsProvider`. Feature code must never read `process.env` directly.

**Severity:** HIGH — Exposes the module to hard-coded fallback secrets and prevents environment-safe secret rotation.

---

### 2. Adapter construction in module-level wiring instead of composition root
**File:** `wiring.ts:1-8` (entire file)
```ts
import { TwilioClient } from '../../adapters/sms/twilio-client.js';

let cached: TwilioClient | null = null;

export function getSmsAdapter(): TwilioClient {
  cached ??= new TwilioClient(process.env.TWILIO_AUTH_TOKEN ?? '', process.env.TWILIO_ACCOUNT_SID ?? '');
  return cached;
}
```

**Rule violated:** Per skill section "Quick reference — where does this code go?":
> *Wiring a concrete impl to an interface → `platform/container.ts`*

Per skill section "Layer map":
> *Composition root | `platform/container.ts` | Wires concrete adapters → port interfaces, lazily; override-able in tests*

**Expected pattern:** Adapter construction and wiring belong **exclusively** in the composition root. The module's `wiring.ts` file should not exist; its responsibility is the container's.

**Severity:** HIGH — Violates the single-responsibility principle of the composition root and makes test mocking impossible (container overrides won't take effect if the module constructs its own adapter).

---

### 3. Service directly calls module-level adapter function instead of resolving through container
**File:** `service.ts:13`
```ts
export class SmsService {
  private repo: SmsRepository;

  constructor(private container: Container) {
    this.repo = new SmsRepository(container.db);
  }

  async send(workspaceId: string, phone: string, body: string): Promise<void> {
    await getSmsAdapter().send(phone, body);  // ❌ VIOLATION
    await this.repo.logSend(workspaceId, phone);
  }
}
```

**Rule violated:** Per skill section "The Dependency Rule (non-negotiable)":
> *`service.ts` depends on **port interfaces**, never concrete adapter classes.*

Per skill section "Canonical module recipe":
> *service | use case | class XService { constructor(private container: Container) {} }*

Per skill section "Common mistakes":
> *Service `new`s an adapter (`new OctokitGitHubClient(...)` inside `service.ts`). → Resolve it off the container; the container owns construction + secrets.*

**Expected pattern:** Service receives the SMS adapter via the container, not via a module-level function. For example:
```ts
async send(workspaceId: string, phone: string, body: string): Promise<void> {
  await this.container.sms.send(phone, body);
  await this.repo.logSend(workspaceId, phone);
}
```

**Severity:** HIGH — Breaks dependency inversion; the service depends on a concrete adapter function instead of an interface. This breaks test isolation (mocks cannot override `getSmsAdapter()`).

---

## Compliant Elements

✅ **routes.ts** correctly:
- Parses request body as untyped DTO (though ideally would use Zod schemas)
- Delegates to service
- Does not contain business logic

✅ **repository.ts** correctly:
- Is the only code touching the `smsLog` table
- Uses Drizzle for queries
- Knows only about the database and its own schema

✅ **constants.ts** correctly:
- Defines a pure literal (`SMS_MAX_LENGTH`)
- Has no I/O or dependencies

---

## Recommendations

### Fix 1: Move adapter wiring to `platform/container.ts`
Add to the container class:
```ts
get sms(): SmsProvider {
  if (this.overrides.sms) return this.overrides.sms;
  this._sms ??= new TwilioClient(
    await this.secrets.resolve('TWILIO_AUTH_TOKEN'),
    await this.secrets.resolve('TWILIO_ACCOUNT_SID')
  );
  return this._sms;
}
```

And add to `ContainerOverrides`:
```ts
sms?: SmsProvider;
```

### Fix 2: Update service to resolve through container
```ts
async send(workspaceId: string, phone: string, body: string): Promise<void> {
  await this.container.sms.send(phone, body);
  await this.repo.logSend(workspaceId, phone);
}
```

### Fix 3: Delete `wiring.ts`
Remove the entire file. The module should not construct its own adapters.

### Fix 4: Define port interface in `@devdigest/shared`
If not already defined, add:
```ts
export interface SmsProvider {
  send(phone: string, body: string): Promise<void>;
}
```

Then implement it in `adapters/sms/twilio-client.ts`:
```ts
export class TwilioClient implements SmsProvider {
  // ...
}
```

---

## Impact on Testing

With these violations in place:
- Unit tests **cannot inject mock** SMS adapters via `container.overrides.sms` because the service bypasses the container
- The hard-coded `process.env` reads make tests vulnerable to environment contamination
- The cached singleton in `wiring.ts` makes it impossible to reset state between test cases

After fixes:
- Tests can inject a mock via container overrides
- Secrets resolve safely from test fixtures, not environment
- Each test can control which SMS provider instance is used
