# SafeHook

Reliable webhook processing primitives for TypeScript.

SafeHook helps you verify, dedupe, track, and replay webhook deliveries without forcing you into a framework, queue, ORM, or storage stack.

## Why SafeHook

Webhook handlers usually need the same reliability layer:

- verify provider signatures against the exact raw request body
- prevent duplicate execution during retries and redeliveries
- coordinate concurrent deliveries safely
- persist processing state for debugging and replay
- expose clean hooks for metrics and operations

SafeHook focuses on that layer and stays out of the rest of your application.

## What It Is

SafeHook is:

- framework-agnostic
- storage-agnostic
- dependency-light
- built for exact raw-body verification
- designed for idempotent, replay-safe processing

SafeHook is not:

- a workflow engine
- a queue system
- an event bus
- a webhook SaaS
- an orchestration platform
- a backend framework

## Installation

```bash
npm install safehook
```

SafeHook does not install Redis, PostgreSQL, or provider SDKs for you. If your application wants those integrations, your application owns those dependencies.

## Quickstart

```ts
import { createSafeHook, memoryStore, stripe } from "safehook";

const safehook = createSafeHook({
  store: memoryStore(),
});

await safehook.process({
  rawBody,
  headers,
  provider: stripe({
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  }),
  onEvent: async (event, ctx) => {
    console.log("processed", ctx.eventType, ctx.idempotencyKey);
  },
});
```

## Core Model

You bring:

- the exact `rawBody`
- request `headers`
- provider configuration
- storage choice
- business logic

SafeHook provides:

- signature verification
- provider event parsing
- idempotency key resolution
- atomic duplicate prevention
- processing state tracking
- replay-safe execution
- lifecycle hooks for observability

## Feature Overview

- `createSafeHook()` for reusable process/replay orchestration
- `processWebhook()` and `replayWebhook()` core functions
- built-in stores:
  - `memoryStore()`
  - `redisStore(client, { mode: "node-redis" })`
  - `postgresStore(client, { mode: "pg" })`
- built-in providers:
  - `stripe()`
  - `github()`
  - `customProvider()`
- HTTP helper:
  - `handleWebhookHttp()`
- framework adapter helpers:
  - Express
  - Fastify
  - Hono
  - Next route handler style
- metrics helpers:
  - OpenTelemetry
  - Prometheus

## Reliability Defaults

SafeHook defaults are intentionally conservative:

- exact `rawBody` is always required for verification and parsing
- `eventPayload` is stored by default so replay can work
- `rawBody` is not stored unless `storeRawBody: true`
- normalized `headers` are not stored unless `storeHeaders: true`

SafeHook verifies and parses against the `rawBody` you provide. It does not reserialize or mutate the body before signature verification.

## Minimal-Persistence Example

If you want replay support without persisting `rawBody` or normalized headers, start here:

- [examples/stripe-minimal-persistence.ts](/Users/valunlabs/Desktop/SafeHook/examples/stripe-minimal-persistence.ts)

## HTTP Behavior

`handleWebhookHttp()` maps common SafeHook failures into deterministic HTTP responses:

- invalid signature -> `401`
- parse or metadata problems -> `400`
- store or infrastructure failures -> `500`
- replay/conflict-style failures -> `409`

This keeps invalid webhook traffic from surfacing as generic framework `500` errors.

## Storage Model

SafeHook does not own infrastructure.

You can use:

- in-memory storage for local development and tests
- Redis for distributed claim coordination
- PostgreSQL for durable audit trails and failure review
- custom stores that implement the SafeHook store contract

Mode-specific typing is exported when you want stronger TypeScript support for concrete client shapes:

- `NodeRedisClient`
- `NodeRedisStoreOptions`
- `PgClient`
- `PgStoreOptions`

See [docs/stores.md](/Users/valunlabs/Desktop/SafeHook/docs/stores.md).

## Provider Typing

SafeHook keeps provider payloads broad by default so upstream event changes do not get excluded by narrow package types.

For stronger typing on common payload families, SafeHook also exports helper types.

Stripe examples:

- `StripeCheckoutSessionEvent`
- `StripeInvoiceEvent`
- `StripePaymentIntentEvent`

GitHub examples:

- `GitHubIssuesEvent`
- `GitHubPullRequestEvent`
- `GitHubPushEvent`

Both `stripe()` and `github()` support generic typing when you want to narrow payloads intentionally.

See [docs/providers.md](/Users/valunlabs/Desktop/SafeHook/docs/providers.md).

## Replay and Operations

SafeHook stores lifecycle state so operators can inspect failures and replay events safely.

Tracked statuses include:

- `received`
- `processing`
- `succeeded`
- `failed`
- `duplicate`
- `expired`

Replay is handler-driven: SafeHook manages the reliability flow, and your application supplies the business handler.

See:

- [docs/replay.md](/Users/valunlabs/Desktop/SafeHook/docs/replay.md)
- [docs/security.md](/Users/valunlabs/Desktop/SafeHook/docs/security.md)
- [docs/dashboard.md](/Users/valunlabs/Desktop/SafeHook/docs/dashboard.md)

## Real-World Examples

- [examples/stripe-memory.ts](/Users/valunlabs/Desktop/SafeHook/examples/stripe-memory.ts)
- [examples/custom-provider.ts](/Users/valunlabs/Desktop/SafeHook/examples/custom-provider.ts)
- [real_world_examples/README.md](/Users/valunlabs/Desktop/SafeHook/real_world_examples/README.md)

## Release Docs

- [docs/release-checklist.md](/Users/valunlabs/Desktop/SafeHook/docs/release-checklist.md)
- [docs/release-notes-v0.1.0.md](/Users/valunlabs/Desktop/SafeHook/docs/release-notes-v0.1.0.md)

## Current Scope

SafeHook is a focused reliability layer for incoming webhooks. That focus is deliberate. The package should stay small, predictable, and easy to compose into different application architectures.
