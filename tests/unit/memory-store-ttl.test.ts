import { describe, expect, it } from "vitest";
import { memoryStore } from "../../src/index.ts";
import { createStoredWebhook } from "../helpers/stored.js";

describe("memory store ttl", () => {
  it("expires records and allows a later claim", async () => {
    let now = 1_000;
    const store = memoryStore({ now: () => new Date(now) });
    const first = createStoredWebhook("evt_ttl");
    const second = createStoredWebhook("evt_ttl", { eventType: "test.event.second" });

    expect(await store.claim({ key: first.key, webhook: first, ttlMs: 50 })).toMatchObject({
      status: "claimed",
    });

    now = 1_100;

    expect((await store.get(first.key))?.status).toBe("expired");
    expect(await store.claim({ key: second.key, webhook: second })).toMatchObject({
      status: "claimed",
      stored: { eventType: "test.event.second" },
    });
  });
});
