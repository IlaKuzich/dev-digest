# semver-discipline

When a PR contains a breaking change (see `breaking-change` / `response-schema`),
**require a major version bump**. A breaking change shipped under a minor or patch bump
is a finding. Cite both the breaking change and the version line in `package.json`.

## Bad (flag it)

```diff
// package.json
- "version": "1.4.2"
+ "version": "1.4.3"        // patch bump…
```
```diff
// …while also removing a public field
- export interface Order { id: string; couponCode: string; }
+ export interface Order { id: string; }
```
→ breaking change under a patch bump. Require `2.0.0`.

## Good (do not flag)

```diff
// package.json — breaking change is accompanied by a major bump
- "version": "1.4.2"
+ "version": "2.0.0"
```
