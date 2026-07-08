# deprecation-policy

Prefer **deprecation over silent removal**. A field or route removed without a prior
`@deprecated` marker (and a migration note pointing at the replacement) is a finding.
Deprecate in one release; remove only in the next major.

## Bad (flag it)

```ts
// deleting a route outright, no deprecation window
- app.get('/v1/foo', getFoo)
```

## Good (do not flag)

```ts
/** @deprecated use `GET /v2/foo` — removed in v3.0.0 */
app.get('/v1/foo', getFoo)
app.get('/v2/foo', getFooV2)
```
