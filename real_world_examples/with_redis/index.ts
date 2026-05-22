import { createClient } from "redis";
import { createSafeHook, customProvider, redisStore } from "safehook";

interface ExampleEvent {
  id: string;
  type: string;
  data: { object: { id: string } };
}

const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});

await redis.connect();

const safehook = createSafeHook<ExampleEvent>({
  store: redisStore(redis, { mode: "node-redis" }),
});

let handlerCalls = 0;
const rawBody = JSON.stringify({
  id: "evt_redis_real_1",
  type: "payment.succeeded",
  data: { object: { id: "pi_real_1" } },
});

const results = await Promise.all(
  Array.from({ length: 10 }, () =>
    safehook.process({
      rawBody,
      headers: {},
      provider: customProvider<ExampleEvent>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      onEvent: async () => {
        handlerCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
      },
    }),
  ),
);

console.log(JSON.stringify({
  handlerCalls,
  statuses: results.map((result) => result.status),
}, null, 2));

await redis.quit();
