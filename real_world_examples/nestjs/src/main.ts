import "reflect-metadata";
import { Body, Controller, Headers, Module, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import pg from "pg";
import { createSafeHook, customProvider, postgresStore } from "@safehook/safehook";

interface WebhookEvent {
  id: string;
  type: string;
}

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

const safehook = createSafeHook<WebhookEvent>({
  store: postgresStore(pgClient, { mode: "pg" }),
});

@Controller()
class WebhookController {
  @Post("/webhooks")
  async webhook(@Body() body: unknown, @Headers() headers: Record<string, string>) {
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    return safehook.process({
      rawBody,
      headers,
      provider: customProvider<WebhookEvent>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      onEvent: async (event) => {
        console.log("NestJS processed webhook", event.type);
      },
    });
  }
}

@Module({
  controllers: [WebhookController],
})
class AppModule {}

const app = await NestFactory.create(AppModule);
await app.listen(3000);
