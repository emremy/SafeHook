import Fastify from "fastify";
import pg from "pg";
import { createClient } from "redis";
import { createSafeHook, customProvider, postgresStore, redisStore } from "safehook";

interface WebhookEvent {
  id: string;
  type: string;
}

const app = Fastify({ logger: true });
app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
  done(null, body);
});

const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
await redis.connect();

const pgClient = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? "postgres://safehook:safehook@localhost:5432/safehook",
});
await pgClient.connect();
await pgClient.query(`
  create table if not exists safehook_webhooks (
    key text primary key,
    status text not null,
    record jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
`);

const provider = customProvider<WebhookEvent>({
  getEventId: (event) => event.id,
  getEventType: (event) => event.type,
});

const redisSafeHook = createSafeHook<WebhookEvent>({
  store: redisStore(redis, { mode: "node-redis" }),
});

const postgresSafeHook = createSafeHook<WebhookEvent>({
  store: postgresStore(pgClient, { mode: "pg" }),
});

app.post("/webhooks/redis", async (request, reply) => {
  const result = await redisSafeHook.process({
    rawBody: String(request.body),
    headers: request.headers,
    provider,
    onEvent: async (event) => {
      request.log.info({ event }, "processed with redis store");
    },
  });
  return reply.code(200).send(result);
});

app.post("/webhooks/postgres", async (request, reply) => {
  const result = await postgresSafeHook.process({
    rawBody: String(request.body),
    headers: request.headers,
    provider,
    onEvent: async (event) => {
      request.log.info({ event }, "processed with postgres store");
    },
  });
  return reply.code(200).send(result);
});

await app.listen({ host: "0.0.0.0", port: 3000 });
