# Release Checklist

Use this checklist before publishing a new SafeHook package version.

## Package correctness

- Confirm `package.json` version matches the intended release.
- Run `npm run build` so `dist/` matches `src/`.
- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run test:examples`.
- Run `env npm_config_cache=/private/tmp/safehook-npm-cache npm pack --dry-run` and inspect the tarball contents.

## Public API review

- Confirm root exports in `src/index.ts` match the intended package surface.
- Confirm generated typings in `dist/index.d.ts` include new exports and option types.
- Confirm runtime behavior in `dist/` matches the documented behavior.

## Persistence and security review

- Confirm `rawBody` is never mutated before verification.
- Confirm `rawBody` persistence is opt-in only.
- Confirm normalized header persistence is opt-in only.
- Confirm replay behavior still matches `storeEventPayload` semantics.
- Confirm docs clearly describe any replay tradeoffs when persistence is reduced.

## Storage review

- Confirm built-in store examples still show user-supplied clients.
- Confirm Redis/PostgreSQL support remains dependency-free for SafeHook consumers unless they explicitly install those clients.
- Confirm mode-specific typing examples still match the current API:
  - `redisStore(client, { mode: "node-redis" })`
  - `postgresStore(client, { mode: "pg" })`

## HTTP behavior review

- Confirm `handleWebhookHttp()` maps expected failures to deterministic HTTP responses.
- Confirm invalid signatures do not escape as framework-default `500` responses.

## Docs and examples

- Confirm `README.md` matches the current defaults and options.
- Confirm `docs/stores.md`, `docs/security.md`, and `docs/replay.md` match the current persistence model.
- Confirm examples compile and still represent recommended usage.
- Confirm at least one example shows a low-retention setup.

## Release notes

- Summarize new APIs, changed defaults, and operator-visible behavior changes.
- Call out any security-relevant defaults explicitly.
- Call out any replay or storage tradeoffs explicitly.
