# AGENTS.md

This file gives repo-specific guidance for agents working in `/Users/valunlabs/Desktop/SafeHook`.

## Project shape

SafeHook is a framework-agnostic TypeScript toolkit for reliable webhook processing:

- provider verification and parsing
- idempotency and duplicate suppression
- replay-safe execution
- pluggable stores
- observability hooks

It is not a queue, workflow engine, ORM, or hosted webhook platform.

## Core product rules

1. Keep `rawBody` user-controlled.
   - `rawBody` is always required for verification/parsing.
   - Persisting `rawBody` is optional and must only happen when the user/application explicitly enables it.
   - Do not silently expand persistence of sensitive payload material.

2. Storage integrations must remain dependency-free by default.
   - Installing `@safehook/safehook` alone must not require `redis`, `pg`, or similar client libraries.
   - Redis/Postgres support should work through user-supplied clients and minimal interfaces.
   - If docs show Redis/Postgres examples, they must clearly say the consuming app installs those clients.

3. Mode-specific typing is part of the public API.
   - Concrete client modes such as `redisStore(client, { mode: "node-redis" })` and `postgresStore(client, { mode: "pg" })` should have explicit types and examples.
   - Generic client support should stay available through `redis-like` / `postgres-like` interfaces.
   - When adding a new store mode, update runtime behavior, exported types, tests, and docs together.

4. Replay behavior must stay honest.
   - Replay depends on stored payload availability.
   - If persistence is reduced for compliance/privacy reasons, docs must explain the replay tradeoff instead of hiding it.

## Editing guidance

- Prefer narrow, public-API-safe changes over broad refactors.
- Keep the package lightweight and avoid introducing runtime dependencies unless there is explicit product direction to do so.
- Update `README.md`, `docs/stores.md`, and any relevant examples when store APIs or persistence semantics change.
- Preserve framework-agnostic behavior across adapters.

## High-value files

- `src/core.ts`: process/replay lifecycle and stored record creation
- `src/types.ts`: public API surface
- `src/stores/*`: built-in store adapters
- `src/adapters/*`: framework/http entry points
- `README.md`: package positioning and quickstart
- `docs/stores.md`: storage contracts and consumer expectations
- `docs/replay.md`: replay guarantees and tradeoffs
- `tests/core.test.ts`: end-to-end core behavior
- `tests/integration/*`: store adapter behavior and mode coverage

## Validation expectations

For changes touching store APIs, persistence semantics, or public types, run:

- `npm run typecheck`
- `npm run test`

If docs or examples changed, make sure examples still match the current exports and option names.
