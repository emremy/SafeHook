import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSafeHook, customProvider, redisStore } from "../../src/index.ts";
import { FakeRedisClient } from "../helpers/fake-redis.js";

interface BillingEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount: number;
    };
  };
}

describe("real-world retry simulations", () => {
  it("executes payment fulfillment once under retry storms", async () => {
    const safehook = createSafeHook<BillingEvent>({
      store: redisStore(new FakeRedisClient()),
    });
    let fulfilled = 0;
    const rawBody = JSON.stringify({
      id: "evt_payment_1",
      type: "payment.succeeded",
      data: { object: { id: "pi_123", amount: 4999 } },
    });

    const deliveries = await Promise.all(
      Array.from({ length: 25 }, () =>
        safehook.process({
          rawBody,
          headers: { "x-delivery": randomUUID() },
          provider: customProvider<BillingEvent>({
            getEventId: (event) => event.id,
            getEventType: (event) => event.type,
          }),
          onEvent: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            fulfilled += 1;
          },
        }),
      ),
    );

    expect(fulfilled).toBe(1);
    expect(deliveries.filter((result) => result.status === "succeeded")).toHaveLength(1);
    expect(deliveries.filter((result) => result.status === "in_progress")).toHaveLength(24);
  });

  it("does not collapse distinct event types when function resolver includes type", async () => {
    const safehook = createSafeHook<BillingEvent>({
      store: redisStore(new FakeRedisClient()),
    });
    const provider = customProvider<BillingEvent>({
      getEventId: (event) => event.id,
      getEventType: (event) => event.type,
    });
    let calls = 0;

    const paid = await safehook.process({
      rawBody: JSON.stringify({
        id: "evt_a",
        type: "invoice.paid",
        data: { object: { id: "in_123", amount: 4999 } },
      }),
      headers: {},
      provider,
      idempotencyKey: (event) => `${event.type}:${event.data.object.id}`,
      onEvent: async () => {
        calls += 1;
      },
    });

    const finalized = await safehook.process({
      rawBody: JSON.stringify({
        id: "evt_b",
        type: "invoice.finalized",
        data: { object: { id: "in_123", amount: 4999 } },
      }),
      headers: {},
      provider,
      idempotencyKey: (event) => `${event.type}:${event.data.object.id}`,
      onEvent: async () => {
        calls += 1;
      },
    });

    expect(paid.status).toBe("succeeded");
    expect(finalized.status).toBe("succeeded");
    expect(calls).toBe(2);
  });
});
