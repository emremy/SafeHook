import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SafeHookError,
  createSafeHook,
  customProvider,
  handleWebhookHttp,
  github,
  memoryStore,
  stripe,
} from "../src/index.ts";

describe("SafeHook core", () => {
  it("processes a webhook once and suppresses duplicates", async () => {
    const store = memoryStore<{ id: string; type: string }>();
    const safehook = createSafeHook<{ id: string; type: string }>({ store });
    let calls = 0;

    const input = {
      rawBody: JSON.stringify({ id: "evt_1", type: "thing.created" }),
      headers: {},
      provider: customProvider<{ id: string; type: string }>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      onEvent: async () => {
        calls += 1;
      },
    };

    const first = await safehook.process(input);
    const second = await safehook.process(input);

    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("duplicate");
    expect(calls).toBe(1);
  });

  it("supports string path and function idempotency resolvers", async () => {
    const store = memoryStore<{ id: string; type: string; data: { object: { id: string } } }>();
    const safehook = createSafeHook<{ id: string; type: string; data: { object: { id: string } } }>({ store });

    const pathResult = await safehook.process({
      rawBody: JSON.stringify({ id: "evt_2", type: "thing.updated", data: { object: { id: "obj_1" } } }),
      headers: {},
      provider: customProvider<{ id: string; type: string; data: { object: { id: string } } }>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      idempotencyKey: "data.object.id",
      onEvent: async () => undefined,
    });

    const functionResult = await safehook.process({
      rawBody: JSON.stringify({ id: "evt_3", type: "thing.updated", data: { object: { id: "obj_2" } } }),
      headers: {},
      provider: customProvider<{ id: string; type: string; data: { object: { id: string } } }>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      idempotencyKey: (event) => `${event.type}:${event.data.object.id}`,
      onEvent: async () => undefined,
    });

    expect(pathResult.context.idempotencyKey).toBe("obj_1");
    expect(functionResult.context.idempotencyKey).toBe("thing.updated:obj_2");
  });

  it("stores handler failures and allows replay", async () => {
    const store = memoryStore<{ id: string; type: string }>();
    const safehook = createSafeHook<{ id: string; type: string }>({ store });

    const failed = await safehook.process({
      rawBody: JSON.stringify({ id: "evt_fail", type: "thing.failed" }),
      headers: {},
      provider: customProvider<{ id: string; type: string }>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      onEvent: async () => {
        throw new Error("boom");
      },
    });

    let replayed = false;
    const replay = await safehook.replay({
      key: "evt_fail",
      onEvent: async () => {
        replayed = true;
      },
    });

    expect(failed.status).toBe("failed");
    expect(replay.status).toBe("succeeded");
    expect(replayed).toBe(true);
  });

  it("emits lifecycle hooks without letting hook failures break processing", async () => {
    const store = memoryStore<{ id: string; type: string }>();
    const seen: string[] = [];
    const safehook = createSafeHook<{ id: string; type: string }>({
      store,
      hooks: {
        onReceived: () => {
          seen.push("received");
        },
        onClaimed: () => {
          seen.push("claimed");
          throw new Error("metrics sink down");
        },
        onProcessing: () => {
          seen.push("processing");
        },
        onSucceeded: () => {
          seen.push("succeeded");
        },
      },
    });

    const result = await safehook.process({
      rawBody: JSON.stringify({ id: "evt_hooks", type: "thing.hooked" }),
      headers: {},
      provider: customProvider<{ id: string; type: string }>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      onEvent: async () => undefined,
    });

    expect(result.status).toBe("succeeded");
    expect(seen).toEqual(["received", "claimed", "processing", "succeeded"]);
  });

  it("does not persist rawBody unless the user enables it", async () => {
    const store = memoryStore<{ id: string; type: string }>();
    const safehook = createSafeHook<{ id: string; type: string }>({ store });

    const result = await safehook.process({
      rawBody: JSON.stringify({ id: "evt_no_raw_store", type: "thing.created" }),
      headers: {},
      provider: customProvider<{ id: string; type: string }>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      onEvent: async () => undefined,
    });

    expect(result.status).toBe("succeeded");
    expect(result.stored.rawBody).toBeUndefined();
    expect(result.stored.headers).toBeUndefined();
    expect(result.stored.eventPayload).toEqual({ id: "evt_no_raw_store", type: "thing.created" });
  });

  it("persists rawBody when the user enables it", async () => {
    const store = memoryStore<{ id: string; type: string }>();
    const safehook = createSafeHook<{ id: string; type: string }>({ store, storeRawBody: true });
    const rawBody = JSON.stringify({ id: "evt_raw_store", type: "thing.created" });

    const result = await safehook.process({
      rawBody,
      headers: {},
      provider: customProvider<{ id: string; type: string }>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      onEvent: async () => undefined,
    });

    expect(result.status).toBe("succeeded");
    expect(result.stored.rawBody).toBe(rawBody);
  });

  it("persists normalized headers only when the user enables it", async () => {
    const store = memoryStore<{ id: string; type: string }>();
    const safehook = createSafeHook<{ id: string; type: string }>({ store, storeHeaders: true });

    const result = await safehook.process({
      rawBody: JSON.stringify({ id: "evt_header_store", type: "thing.created" }),
      headers: { "X-Test": "abc", "X-Trace": 123 },
      provider: customProvider<{ id: string; type: string }>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      onEvent: async () => undefined,
    });

    expect(result.status).toBe("succeeded");
    expect(result.stored.headers).toEqual({
      "x-test": "abc",
      "x-trace": "123",
    });
  });

  it("can disable eventPayload persistence and block replay intentionally", async () => {
    const store = memoryStore<{ id: string; type: string }>();
    const safehook = createSafeHook<{ id: string; type: string }>({ store, storeEventPayload: false });

    const processed = await safehook.process({
      rawBody: JSON.stringify({ id: "evt_no_payload", type: "thing.created" }),
      headers: {},
      provider: customProvider<{ id: string; type: string }>({
        getEventId: (event) => event.id,
        getEventType: (event) => event.type,
      }),
      onEvent: async () => undefined,
    });

    expect(processed.status).toBe("succeeded");
    expect(processed.stored.eventPayload).toBeUndefined();

    await expect(
      safehook.replay({
        key: "evt_no_payload",
        allowSucceeded: true,
        onEvent: async () => undefined,
      }),
    ).rejects.toMatchObject({
      name: "SafeHookError",
      code: "REPLAY_PAYLOAD_UNAVAILABLE",
    } satisfies Partial<SafeHookError>);
  });

  it("throws typed errors for invalid signatures", async () => {
    const safehook = createSafeHook({ store: memoryStore() });

    await expect(
      safehook.process({
        rawBody: "{}",
        headers: {},
        provider: stripe({ secret: "whsec_test" }),
        onEvent: async () => undefined,
      }),
    ).rejects.toMatchObject({
      name: "SafeHookError",
      code: "INVALID_SIGNATURE",
    } satisfies Partial<SafeHookError>);
  });

  it("maps invalid signature failures to 401 in the HTTP helper", async () => {
    const response = await handleWebhookHttp({
      rawBody: "{}",
      headers: {},
      provider: stripe({ secret: "whsec_test" }),
      store: memoryStore(),
      onEvent: async () => undefined,
    });

    expect(response).toEqual({
      statusCode: 401,
      body: {
        error: {
          code: "INVALID_SIGNATURE",
          message: "Webhook signature verification failed.",
        },
      },
    });
  });

  it("maps provider metadata errors to 400 in the HTTP helper", async () => {
    const response = await handleWebhookHttp({
      rawBody: JSON.stringify({ type: "missing.id" }),
      headers: {},
      provider: customProvider<{ type: string }>({
        getEventId: () => undefined,
        getEventType: (event) => event.type,
      }),
      store: memoryStore(),
      onEvent: async () => undefined,
    });

    expect(response).toEqual({
      statusCode: 400,
      body: {
        error: {
          code: "MISSING_EVENT_METADATA",
          message: "Provider did not return event id or type.",
        },
      },
    });
  });
});

describe("providers", () => {
  it("verifies Stripe signatures", async () => {
    const secret = "whsec_test";
    const rawBody = JSON.stringify({ id: "evt_stripe", type: "payment_intent.succeeded" });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const provider = stripe({ secret });

    await expect(
      Promise.resolve(provider.verify({
        rawBody,
        headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
        now: new Date(timestamp * 1000),
      })),
    ).resolves.toBe(true);
  });

  it("verifies GitHub signatures", async () => {
    const secret = "github_secret";
    const rawBody = JSON.stringify({ action: "opened" });
    const signature = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    const provider = github({ secret });

    await expect(
      Promise.resolve(provider.verify({
        rawBody,
        headers: { "x-hub-signature-256": signature },
        now: new Date(),
      })),
    ).resolves.toBe(true);
  });
});
