# breaking-change

Flag any change that **removes or renames** a field, parameter, route, method, or enum
value that is part of a PUBLIC contract (exported types, route responses, published
schemas). Cite the offending `file:line`. A rename is a remove + add — always breaking.

## Bad (breaking — flag it)

```ts
// before
export interface User { id: string; fullName: string; }
// after  → consumers reading `fullName` break
export interface User { id: string; name: string; }
```

```ts
// removing a query param a route previously accepted
- app.get('/users', { schema: { querystring: z.object({ team: z.string() }) } }, ...)
+ app.get('/users', ...)
```

## Good (non-breaking — do not flag)

```ts
// adding a new OPTIONAL field to a response
export interface User { id: string; name: string; avatarUrl?: string; }
```

```ts
// adding a brand-new route or an optional param with a default
app.get('/users/:id/activity', ...)
```
