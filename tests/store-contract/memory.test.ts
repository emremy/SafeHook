import { describe, expect, it } from "vitest";
import { memoryStore } from "../../src/index.ts";
import type { StoredWebhook } from "../../src/index.ts";

describe("memory store contract", () => {
  it("allows only one concurrent claim for the same key", async () => {
    const store = memoryStore();
    const webhook = createStored("evt_concurrent");

    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.claim({ key: webhook.key, webhook })),
    );

    expect(results.filter((result) => result.status === "claimed")).toHaveLength(1);
    expect(results.filter((result) => result.status === "in_progress")).toHaveLength(9);
  });

  it("marks complete and lists failures", async () => {
    const store = memoryStore();
    const one = createStored("evt_one");
    const two = createStored("evt_two");

    await store.claim({ key: one.key, webhook: one });
    await store.claim({ key: two.key, webhook: two });
    await store.complete({ key: one.key, completedAt: new Date() });
    await store.fail({
      key: two.key,
      failedAt: new Date(),
      error: { name: "Error", message: "nope" },
    });

    expect((await store.get(one.key))?.status).toBe("succeeded");
    expect(await store.listFailures?.()).toHaveLength(1);
  });
});

function createStored(key: string): StoredWebhook {
  const now = new Date().toISOString();
  return {
    version: 1,
    key,
    provider: "test",
    eventId: key,
    eventType: "test.event",
    status: "processing",
    attempts: 1,
    createdAt: now,
    updatedAt: now,
    receivedAt: now,
    startedAt: now,
    eventPayload: { id: key },
    history: [{ status: "processing", at: now }],
  };
}
