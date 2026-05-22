import { createClient } from "redis";
import { createSafeHook, customProvider, redisStore } from "@safehook/safehook";

interface WebhookEvent {
  id: string;
  type: string;
}

let redisPromise: ReturnType<typeof createClient> | undefined;

async function getRedis() {
  if (!redisPromise) {
    redisPromise = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
    await redisPromise.connect();
  }
  return redisPromise;
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const redis = await getRedis();
  const safehook = createSafeHook<WebhookEvent>({
    store: redisStore(redis, { mode: "node-redis" }),
  });

  const result = await safehook.process({
    rawBody,
    headers: request.headers,
    provider: customProvider<WebhookEvent>({
      getEventId: (event) => event.id,
      getEventType: (event) => event.type,
    }),
    onEvent: async (event) => {
      console.log("Next.js processed webhook", event.type);
    },
  });

  return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
}
