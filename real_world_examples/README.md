# SafeHook Real-World Examples

These examples are intentionally separate from the core test suite. They install their own framework/client dependencies and run with Docker so the library can be exercised against realistic infrastructure.

## Examples

- `with_redis`: duplicate suppression and replay using Redis
- `with_postgres`: durable failure storage and replay using PostgreSQL
- `fastify`: HTTP webhook endpoint backed by Redis and PostgreSQL
- `nextjs`: Next.js route handler shape for raw-body webhook processing
- `nestjs`: NestJS controller shape for raw-body webhook processing

Run an example from its directory:

```bash
docker compose up --build
```

For a lightweight in-repo starting point without external storage dependencies, see [examples/stripe-minimal-persistence.ts](/Users/valunlabs/Desktop/SafeHook/examples/stripe-minimal-persistence.ts).
