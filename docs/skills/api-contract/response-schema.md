# response-schema

Flag changes to the **shape of a response**: a field changing type, becoming required,
or being removed. `optional → required` is breaking (old clients omit it);
`required → optional` is not. A field type change (`number → string`) is breaking.

## Bad (breaking — flag it)

```ts
// field type change — clients parsing a number now get a string
- total: z.number()
+ total: z.string()
```

```ts
// optional → required — existing callers that omit `email` now fail validation
- email: z.string().optional()
+ email: z.string()
```

## Good (non-breaking — do not flag)

```ts
// adding an optional field
+ nextCursor: z.string().optional()
```

```ts
// loosening required → optional
- id: z.string()
+ id: z.string().optional()
```
