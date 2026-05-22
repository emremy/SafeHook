import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SafeHookError,
  createSafeHook,
  customProvider,
  github,
  memoryStore,
  redisStore,
  stripe,
  type GitHubEvent,
  type StripeEvent,
} from "../../src/index.ts";
import { FakeRedisClient } from "../helpers/fake-redis.js";

describe("production idempotency scenarios", () => {
  it("Stripe retry storm executes a payment fulfillment handler once", async () => {
    const safehook = createSafeHook<StripeEvent>({
      store: redisStore(new FakeRedisClient()),
    });
    const rawBody = JSON.stringify({
      id: "evt_stripe_retry_storm",
      type: "checkout.session.completed",
      data: { object: { id: "cs_live_123", payment_status: "paid" } },
    });
    const headers = stripeHeaders(rawBody, "whsec_retry_storm");
    let fulfillments = 0;

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        safehook.process({
          rawBody,
          headers,
          provider: stripe({ secret: "whsec_retry_storm" }),
          onEvent: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            fulfillments += 1;
          },
        }),
      ),
    );

    expect(fulfillments).toBe(1);
    expect(results.filter((result) => result.status === "succeeded")).toHaveLength(1);
    expect(results.filter((result) => result.status === "in_progress")).toHaveLength(49);
  });

  it("Stripe redelivery after success is returned as duplicate and never re-runs business logic", async () => {
    const safehook = createSafeHook<StripeEvent>({
      store: memoryStore(),
    });
    const rawBody = JSON.stringify({
      id: "evt_stripe_redelivery",
      type: "invoice.paid",
      data: { object: { id: "in_live_123" } },
    });
    const input = {
      rawBody,
      headers: stripeHeaders(rawBody, "whsec_redelivery"),
      provider: stripe({ secret: "whsec_redelivery" }),
      onEvent: async () => {
        calls += 1;
      },
    };
    let calls = 0;

    const first = await safehook.process(input);
    const second = await safehook.process(input);

    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("duplicate");
    expect(second.context.isDuplicate).toBe(true);
    expect(second.context.idempotencyKey).toBe("evt_stripe_redelivery");
    expect(calls).toBe(1);
  });

  it("Stripe defaults to event.id so distinct events for the same object both process", async () => {
    const safehook = createSafeHook<StripeEvent>({
      store: memoryStore(),
    });
    let calls = 0;

    const first = stripePayload("evt_object_a", "invoice.finalized", "in_same_object");
    const second = stripePayload("evt_object_b", "invoice.paid", "in_same_object");

    const firstResult = await safehook.process({
      rawBody: first,
      headers: stripeHeaders(first, "whsec_distinct_events"),
      provider: stripe({ secret: "whsec_distinct_events" }),
      onEvent: async () => {
        calls += 1;
      },
    });

    const secondResult = await safehook.process({
      rawBody: second,
      headers: stripeHeaders(second, "whsec_distinct_events"),
      provider: stripe({ secret: "whsec_distinct_events" }),
      onEvent: async () => {
        calls += 1;
      },
    });

    expect(firstResult.status).toBe("succeeded");
    expect(secondResult.status).toBe("succeeded");
    expect(calls).toBe(2);
  });

  it("Stripe business-object resolver intentionally collapses noisy events for the same object", async () => {
    const safehook = createSafeHook<StripeEvent>({
      store: memoryStore(),
    });
    let calls = 0;

    const first = stripePayload("evt_object_c", "customer.subscription.updated", "sub_same_object");
    const second = stripePayload("evt_object_d", "customer.subscription.updated", "sub_same_object");

    const sharedInput = {
      provider: stripe({ secret: "whsec_business_key" }),
      idempotencyKey: (event: StripeEvent) => {
        const data = event.data as { object?: { id?: string } } | undefined;
        return data?.object?.id;
      },
      onEvent: async () => {
        calls += 1;
      },
    };

    const firstResult = await safehook.process({
      ...sharedInput,
      rawBody: first,
      headers: stripeHeaders(first, "whsec_business_key"),
    });
    const secondResult = await safehook.process({
      ...sharedInput,
      rawBody: second,
      headers: stripeHeaders(second, "whsec_business_key"),
    });

    expect(firstResult.status).toBe("succeeded");
    expect(secondResult.status).toBe("duplicate");
    expect(secondResult.context.idempotencyKey).toBe("sub_same_object");
    expect(calls).toBe(1);
  });

  it("GitHub redelivery with the same delivery id executes once", async () => {
    const safehook = createSafeHook<GitHubEvent>({
      store: memoryStore(),
    });
    const rawBody = JSON.stringify({ action: "opened", issue: { id: 123 } });
    const headers = githubHeaders(rawBody, "github_secret", "delivery-1", "issues");
    let calls = 0;

    const first = await safehook.process({
      rawBody,
      headers,
      provider: github({ secret: "github_secret" }),
      onEvent: async () => {
        calls += 1;
      },
    });
    const redelivery = await safehook.process({
      rawBody,
      headers,
      provider: github({ secret: "github_secret" }),
      onEvent: async () => {
        calls += 1;
      },
    });

    expect(first.status).toBe("succeeded");
    expect(redelivery.status).toBe("duplicate");
    expect(redelivery.context.idempotencyKey).toBe("delivery-1");
    expect(calls).toBe(1);
  });

  it("GitHub different delivery ids process independently by default", async () => {
    const safehook = createSafeHook<GitHubEvent>({
      store: memoryStore(),
    });
    const rawBody = JSON.stringify({ action: "synchronize", pull_request: { id: 987 } });
    let calls = 0;

    const first = await safehook.process({
      rawBody,
      headers: githubHeaders(rawBody, "github_secret", "delivery-a", "pull_request"),
      provider: github({ secret: "github_secret" }),
      onEvent: async () => {
        calls += 1;
      },
    });
    const second = await safehook.process({
      rawBody,
      headers: githubHeaders(rawBody, "github_secret", "delivery-b", "pull_request"),
      provider: github({ secret: "github_secret" }),
      onEvent: async () => {
        calls += 1;
      },
    });

    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("succeeded");
    expect(calls).toBe(2);
  });

  it("GitHub custom resolver can collapse deliveries by repository action and issue id", async () => {
    const safehook = createSafeHook<GitHubEvent>({
      store: memoryStore(),
    });
    const rawBody = JSON.stringify({
      action: "opened",
      repository: { full_name: "acme/widgets" },
      issue: { id: 123 },
    });
    let calls = 0;

    const idempotencyKey = (event: GitHubEvent) => {
      const repository = event.repository as { full_name?: string } | undefined;
      const issue = event.issue as { id?: number } | undefined;
      return `${repository?.full_name}:${event.action}:${issue?.id}`;
    };

    const first = await safehook.process({
      rawBody,
      headers: githubHeaders(rawBody, "github_secret", "delivery-custom-a", "issues"),
      provider: github({ secret: "github_secret" }),
      idempotencyKey,
      onEvent: async () => {
        calls += 1;
      },
    });
    const second = await safehook.process({
      rawBody,
      headers: githubHeaders(rawBody, "github_secret", "delivery-custom-b", "issues"),
      provider: github({ secret: "github_secret" }),
      idempotencyKey,
      onEvent: async () => {
        calls += 1;
      },
    });

    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("duplicate");
    expect(second.context.idempotencyKey).toBe("acme/widgets:opened:123");
    expect(calls).toBe(1);
  });

  it("missing idempotency metadata fails closed before handler execution", async () => {
    const safehook = createSafeHook({
      store: memoryStore(),
    });
    let calls = 0;

    await expect(
      safehook.process({
        rawBody: JSON.stringify({ type: "provider.event_without_id" }),
        headers: {},
        provider: customProvider<{ type: string }>({
          getEventId: () => "provider-event-without-business-key",
          getEventType: (event) => event.type,
        }),
        idempotencyKey: "data.object.id",
        onEvent: async () => {
          calls += 1;
        },
      }),
    ).rejects.toMatchObject({
      code: "MISSING_IDEMPOTENCY_KEY",
    } satisfies Partial<SafeHookError>);

    expect(calls).toBe(0);
  });

  it("failed provider retry stays suppressed until an explicit replay is requested", async () => {
    const safehook = createSafeHook<StripeEvent>({
      store: memoryStore(),
    });
    const rawBody = JSON.stringify({
      id: "evt_failed_then_provider_retry",
      type: "invoice.payment_failed",
    });
    const input = {
      rawBody,
      headers: stripeHeaders(rawBody, "whsec_failure_retry"),
      provider: stripe({ secret: "whsec_failure_retry" }),
    };
    let calls = 0;

    const failed = await safehook.process({
      ...input,
      onEvent: async () => {
        calls += 1;
        throw new Error("transient downstream outage");
      },
    });
    const providerRetry = await safehook.process({
      ...input,
      onEvent: async () => {
        calls += 1;
      },
    });
    const replay = await safehook.replay({
      key: "evt_failed_then_provider_retry",
      onEvent: async () => {
        calls += 1;
      },
    });

    expect(failed.status).toBe("failed");
    expect(providerRetry.status).toBe("duplicate");
    expect(replay.status).toBe("succeeded");
    expect(calls).toBe(2);
  });
});

function stripePayload(eventId: string, type: string, objectId: string): string {
  return JSON.stringify({
    id: eventId,
    type,
    data: { object: { id: objectId } },
  });
}

function stripeHeaders(rawBody: string, secret: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return {
    "stripe-signature": `t=${timestamp},v1=${signature}`,
  };
}

function githubHeaders(
  rawBody: string,
  secret: string,
  delivery: string,
  event: string,
): Record<string, string> {
  return {
    "x-hub-signature-256": "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex"),
    "x-github-delivery": delivery,
    "x-github-event": event,
  };
}
