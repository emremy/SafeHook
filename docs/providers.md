# Provider Quickstarts

## Stripe

```ts
import { stripe } from "safehook";

provider: stripe({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
});
```

SafeHook verifies the `stripe-signature` header and uses `event.id` as the default idempotency key.

If you want stronger event typing without narrowing Stripe's full event surface, SafeHook also exports helper types such as:

- `StripeCheckoutSessionEvent`
- `StripeInvoiceEvent`
- `StripePaymentIntentEvent`

```ts
import { type StripeCheckoutSessionEvent } from "safehook";

type CheckoutCompletedEvent = StripeCheckoutSessionEvent<"checkout.session.completed">;
```

If you want the provider itself to produce that narrower type, you can parameterize `stripe()`:

```ts
import {
  stripe,
  type StripeCheckoutSessionEvent,
  type StripeCheckoutSessionObject,
} from "safehook";

const provider = stripe<"checkout.session.completed", StripeCheckoutSessionObject>({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
});

type CheckoutCompletedEvent = StripeCheckoutSessionEvent<"checkout.session.completed">;
```

## GitHub

```ts
import { github } from "safehook";

provider: github({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});
```

SafeHook verifies `x-hub-signature-256` and uses `x-github-delivery` as the default idempotency key.

GitHub event type comes from the `x-github-event` header, so SafeHook keeps the payload typing broad by default. For stronger typing on common payload families, SafeHook also exports helper payload types such as:

- `GitHubIssuesEvent`
- `GitHubPullRequestEvent`
- `GitHubPushEvent`

```ts
import { github, type GitHubIssuesEvent } from "safehook";

const provider = github<GitHubIssuesEvent>({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});
```

## Custom

```ts
import { customProvider } from "safehook";

provider: customProvider({
  getEventId: (event) => event.id,
  getEventType: (event) => event.type,
});
```
