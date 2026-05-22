import { createSafeHook, memoryStore, stripe, type StripeEvent } from "safehook";

const safehook = createSafeHook({
  store: memoryStore<StripeEvent>(),
});

export async function handleStripeWebhook(rawBody: string, headers: Record<string, string>): Promise<void> {
  await safehook.process({
    rawBody,
    headers,
    provider: stripe({
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    }),
    onEvent: async (event) => {
      console.log("stripe event", event.type);
    },
  });
}
