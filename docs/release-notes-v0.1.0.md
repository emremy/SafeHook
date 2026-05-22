# SafeHook v0.1.0 Release Notes

SafeHook v0.1.0 introduces a framework-agnostic TypeScript core for reliable webhook processing with provider verification, idempotency, replay support, pluggable stores, and lifecycle hooks.

## Highlights

- Core `createSafeHook()` process and replay APIs
- Built-in `memoryStore()`
- Built-in Redis and PostgreSQL store adapters with user-supplied clients
- Stripe, GitHub, and custom providers
- Lifecycle hooks for observability and operations
- HTTP helper and framework adapter helpers
- Optional dashboard HTML generator

## Storage and persistence defaults

SafeHook is designed so the application owns infrastructure and retention choices.

Default persistence behavior:

- `eventPayload` is stored by default so replay can work
- `rawBody` is not stored unless `storeRawBody: true`
- normalized `headers` are not stored unless `storeHeaders: true`

Exact `rawBody` must still be supplied by the application for verification and parsing. SafeHook does not rewrite or reserialize the body before signature verification.

## Storage client model

SafeHook does not install Redis or PostgreSQL client libraries for consumers.

Applications bring their own clients, for example:

- `redisStore(client, { mode: "node-redis" })`
- `postgresStore(client, { mode: "pg" })`

Mode-specific TypeScript types are exported so applications can get strong typing for concrete client shapes while still supporting generic Redis-like and Postgres-like clients.

## Provider typing helpers

SafeHook keeps Stripe and GitHub provider payloads broad by default so new upstream event shapes do not get excluded by an overly narrow package type.

At the same time, SafeHook now exports helper types for common payload families so applications can opt into stronger typing where it helps:

Stripe helpers:

- `StripeCheckoutSessionEvent`
- `StripeInvoiceEvent`
- `StripePaymentIntentEvent`

GitHub helpers:

- `GitHubIssuesEvent`
- `GitHubPullRequestEvent`
- `GitHubPushEvent`

Both `stripe()` and `github()` support generic typing so applications can narrow payloads intentionally without forcing those narrower assumptions onto every consumer.

## HTTP behavior

`handleWebhookHttp()` returns deterministic HTTP responses for common SafeHook failures:

- invalid signature -> `401`
- parse/metadata/input problems -> `400`
- store/infrastructure failures -> `500`
- replay/conflict-style failures -> `409`

This avoids leaking signature and validation failures into framework-default `500` responses that may trigger misleading webhook retries.

## Recommended starting points

- General quickstart: `README.md`
- Store behavior: `docs/stores.md`
- Security notes: `docs/security.md`
- Replay tradeoffs: `docs/replay.md`
- Minimal-persistence example: `examples/stripe-minimal-persistence.ts`
