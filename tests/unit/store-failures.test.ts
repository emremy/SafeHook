import { describe, expect, it } from "vitest";
import {
  SafeHookError,
  createSafeHook,
  customProvider,
  type ClaimInput,
  type ClaimResult,
  type CompleteInput,
  type FailInput,
  type SafeHookStore,
  type StoredWebhook,
} from "../../src/index.ts";

describe("store failure normalization", () => {
  it("wraps claim failures as STORE_FAILED", async () => {
    const safehook = createSafeHook({
      store: throwingStore("claim"),
    });

    await expect(
      safehook.process({
        rawBody: JSON.stringify({ id: "evt_store_claim", type: "store.claim" }),
        headers: {},
        provider: customProvider<{ id: string; type: string }>({
          getEventId: (event) => event.id,
          getEventType: (event) => event.type,
        }),
        onEvent: async () => undefined,
      }),
    ).rejects.toMatchObject({
      code: "STORE_FAILED",
      message: "SafeHook store claim failed.",
    } satisfies Partial<SafeHookError>);
  });

  it("wraps completion update failures as STORE_FAILED", async () => {
    const safehook = createSafeHook({
      store: throwingStore("complete"),
    });

    await expect(
      safehook.process({
        rawBody: JSON.stringify({ id: "evt_store_complete", type: "store.complete" }),
        headers: {},
        provider: customProvider<{ id: string; type: string }>({
          getEventId: (event) => event.id,
          getEventType: (event) => event.type,
        }),
        onEvent: async () => undefined,
      }),
    ).rejects.toMatchObject({
      code: "STORE_FAILED",
      message: "SafeHook store completion update failed.",
    } satisfies Partial<SafeHookError>);
  });

  it("wraps replay read failures as STORE_FAILED", async () => {
    const safehook = createSafeHook({
      store: throwingStore("get"),
    });

    await expect(
      safehook.replay({
        key: "evt_store_get",
        onEvent: async () => undefined,
      }),
    ).rejects.toMatchObject({
      code: "STORE_FAILED",
      message: "SafeHook store read failed.",
    } satisfies Partial<SafeHookError>);
  });
});

function throwingStore(failOn: "claim" | "complete" | "get"): SafeHookStore<{ id: string; type: string }> {
  const records = new Map<string, StoredWebhook<{ id: string; type: string }>>();

  return {
    async claim(input: ClaimInput<{ id: string; type: string }>): Promise<ClaimResult<{ id: string; type: string }>> {
      if (failOn === "claim") throw new Error("claim unavailable");
      records.set(input.key, input.webhook);
      return { status: "claimed", stored: input.webhook };
    },
    async complete(_input: CompleteInput): Promise<void> {
      if (failOn === "complete") throw new Error("complete unavailable");
    },
    async fail(_input: FailInput): Promise<void> {
      return undefined;
    },
    async get(key: string): Promise<StoredWebhook<{ id: string; type: string }> | null> {
      if (failOn === "get") throw new Error("get unavailable");
      return records.get(key) ?? null;
    },
  };
}
