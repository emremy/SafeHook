import { describe, expect, it } from "vitest";
import { SafeHookError, createSafeHook, memoryStore } from "../../src/index.ts";
import { createStoredWebhook } from "../helpers/stored.js";

describe("replay policy", () => {
  it("rejects missing replay records with a typed error", async () => {
    const safehook = createSafeHook({ store: memoryStore() });

    await expect(
      safehook.replay({
        key: "evt_missing",
        onEvent: async () => undefined,
      }),
    ).rejects.toMatchObject({
      name: "SafeHookError",
      code: "REPLAY_NOT_FOUND",
    } satisfies Partial<SafeHookError>);
  });

  it("rejects succeeded event replay unless explicitly allowed", async () => {
    const store = memoryStore();
    const safehook = createSafeHook({ store });
    const stored = createStoredWebhook("evt_done", { status: "succeeded" });

    await store.claim({ key: stored.key, webhook: stored });
    await store.complete({ key: stored.key, completedAt: new Date() });

    await expect(
      safehook.replay({
        key: stored.key,
        onEvent: async () => undefined,
      }),
    ).rejects.toMatchObject({
      code: "REPLAY_NOT_ALLOWED",
    } satisfies Partial<SafeHookError>);
  });

  it("allows explicit replay of succeeded events", async () => {
    const store = memoryStore();
    const safehook = createSafeHook({ store });
    const stored = createStoredWebhook("evt_done_allowed", { status: "succeeded" });
    let calls = 0;

    await store.claim({ key: stored.key, webhook: stored });
    await store.complete({ key: stored.key, completedAt: new Date() });

    const result = await safehook.replay({
      key: stored.key,
      allowSucceeded: true,
      onEvent: async () => {
        calls += 1;
      },
    });

    expect(result.status).toBe("succeeded");
    expect(calls).toBe(1);
    expect((await store.get(stored.key))?.attempts).toBe(2);
  });
});
