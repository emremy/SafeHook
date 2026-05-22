import {
  createSafeHook,
  memoryStore,
  stripe,
  type StripeCheckoutSessionEvent,
  type StripeCheckoutSessionObject,
} from "@safehook/safehook";

const safehook = createSafeHook<StripeCheckoutSessionEvent<"checkout.session.completed">>({
  store: memoryStore(),
  storeRawBody: false,
  storeHeaders: false,
  storeEventPayload: true,
});

export async function handleStripeWebhook(rawBody: string, headers: Record<string, string>): Promise<void> {
  await safehook.process({
    rawBody,
    headers,
    provider: stripe<"checkout.session.completed", StripeCheckoutSessionObject>({
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    }),
    onEvent: async (event) => {
      console.log("stripe event", event.type);
    },
  });
}
