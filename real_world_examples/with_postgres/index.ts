import pg from "pg";
import { createSafeHook, customProvider, postgresStore } from "safehook";

interface ExampleEvent {
  id: string;
  type: string;
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? "postgres://safehook:safehook@localhost:5432/safehook",
});

await client.connect();
await client.query(`
  create table if not exists safehook_webhooks (
    key text primary key,
    status text not null,
    record jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
`);

const safehook = createSafeHook<ExampleEvent>({
  store: postgresStore(client, { mode: "pg" }),
});

const failed = await safehook.process({
  rawBody: JSON.stringify({ id: "evt_pg_real_1", type: "invoice.failed" }),
  headers: {},
  provider: customProvider<ExampleEvent>({
    getEventId: (event) => event.id,
    getEventType: (event) => event.type,
  }),
  onEvent: async () => {
    throw new Error("first attempt fails");
  },
});

const replayed = await safehook.replay({
  key: "evt_pg_real_1",
  onEvent: async () => undefined,
});

console.log(JSON.stringify({
  firstStatus: failed.status,
  replayStatus: replayed.status,
  stored: await postgresStore(client, { mode: "pg" }).get("evt_pg_real_1"),
}, null, 2));

await client.end();
