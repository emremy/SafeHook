import { describe, expect, it } from "vitest";
import { redisStore } from "../../src/index.ts";
import { FakeRedisClient } from "../helpers/fake-redis.js";
import { createStoredWebhook } from "../helpers/stored.js";

describe("redis store adapter", () => {
  it("uses NX claim semantics and returns in_progress while processing", async () => {
    const client = new FakeRedisClient();
    const store = redisStore(client);
    const stored = createStoredWebhook("evt_redis_claim");

    const first = await store.claim({ key: stored.key, webhook: stored });
    const second = await store.claim({ key: stored.key, webhook: stored });

    expect(first.status).toBe("claimed");
    expect(second.status).toBe("in_progress");
  });

  it("returns duplicate after completion and preserves stored metadata", async () => {
    const client = new FakeRedisClient();
    const store = redisStore(client, { prefix: "test" });
    const stored = createStoredWebhook("evt_redis_done", {
      providerMetadata: { providerDelivery: "abc" },
    });

    await store.claim({ key: stored.key, webhook: stored });
    await store.complete({ key: stored.key, completedAt: new Date("2026-01-01T00:00:01.000Z") });

    const duplicate = await store.claim({ key: stored.key, webhook: stored });

    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.stored.status).toBe("succeeded");
    expect(duplicate.stored.providerMetadata).toEqual({ providerDelivery: "abc" });
  });

  it("honors Redis-style PX ttl", async () => {
    let now = 1_000;
    const client = new FakeRedisClient(() => now);
    const store = redisStore(client);
    const first = createStoredWebhook("evt_redis_ttl");
    const second = createStoredWebhook("evt_redis_ttl", { eventType: "second" });

    await store.claim({ key: first.key, webhook: first, ttlMs: 50 });
    now = 1_100;

    expect(await store.claim({ key: second.key, webhook: second })).toMatchObject({
      status: "claimed",
      stored: { eventType: "second" },
    });
  });

  it("serializes concurrent replay claims with a replay lock", async () => {
    const client = new FakeRedisClient();
    const store = redisStore(client);
    const failed = createStoredWebhook("evt_redis_replay", { status: "failed" });

    await store.claim({ key: failed.key, webhook: failed });
    await store.fail({
      key: failed.key,
      failedAt: new Date("2026-01-01T00:00:01.000Z"),
      error: { name: "Error", message: "handler failed" },
    });

    const first = await store.beginReplay?.({
      key: failed.key,
      stored: failed,
      startedAt: new Date("2026-01-01T00:00:02.000Z"),
    });
    const second = await store.beginReplay?.({
      key: failed.key,
      stored: failed,
      startedAt: new Date("2026-01-01T00:00:02.000Z"),
    });

    expect(first).toMatchObject({ status: "claimed", stored: { attempts: 2 } });
    expect(second).toMatchObject({ status: "in_progress" });
  });
});
