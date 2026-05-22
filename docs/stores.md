# Store Guide

## Memory

Use `memoryStore()` for tests and local development.

Persistence defaults in SafeHook core:

- `eventPayload` is stored by default so replay can work
- `rawBody` is not stored unless `storeRawBody: true`
- normalized `headers` are not stored unless `storeHeaders: true`

Minimal-persistence setup:

```ts
import { createSafeHook, memoryStore } from "@safehook/safehook";

const safehook = createSafeHook({
  store: memoryStore(),
  storeRawBody: false,
  storeHeaders: false,
  storeEventPayload: true,
});
```

That keeps replay available while avoiding `rawBody` and normalized header persistence.

## Redis

Use `redisStore(client, { mode: "node-redis" })` for distributed systems when using the `redis` npm package.

```ts
import { createClient } from "redis";
import { redisStore } from "@safehook/safehook";

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

const store = redisStore(client, { mode: "node-redis" });
```

SafeHook does not depend on `redis`; your application installs and owns the client. Installing `@safehook/safehook` alone should not pull Redis into the consumer app.

For custom clients, use `mode: "redis-like"` or omit `mode`. The client must implement `get`, `set` with `NX`/`XX`, and optionally `del`.

Type surface:

- `NodeRedisClient` + `NodeRedisStoreOptions` for `mode: "node-redis"`
- `RedisLikeClient` + `RedisLikeStoreOptions` for generic Redis-compatible clients

Atomic claim behavior maps to:

```txt
SET key value NX PX ttl
```

## PostgreSQL

Use `postgresStore(client, { mode: "pg" })` for durable audit trails when using the `pg` npm package. Apply `docs/postgres-schema.sql` before use.

```ts
import pg from "pg";
import { postgresStore } from "@safehook/safehook";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const store = postgresStore(client, { mode: "pg" });
```

SafeHook does not depend on `pg`; your application installs and owns the client. Installing `@safehook/safehook` alone should not pull PostgreSQL client libraries into the consumer app.

For custom clients, use `mode: "postgres-like"` or omit `mode`. The client must implement a `query(sql, params)` method compatible with SafeHook's schema.

Type surface:

- `PgClient` + `PgStoreOptions` for `mode: "pg"`
- `PostgresLikeClient` + `PostgresLikeStoreOptions` for generic PostgreSQL-compatible clients

Atomic claim behavior maps to:

```sql
insert ... on conflict (key) do nothing
```
