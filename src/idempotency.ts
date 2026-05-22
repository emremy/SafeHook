import { SafeHookError } from "./errors.js";
import type { IdempotencyKeyResolver, ParseInput, WebhookProvider } from "./types.js";

export function resolveIdempotencyKey<TEvent>(
  event: TEvent,
  input: ParseInput,
  provider: WebhookProvider<TEvent>,
  resolver?: IdempotencyKeyResolver<TEvent>,
): string {
  let key: string | undefined | null;

  if (typeof resolver === "function") {
    key = resolver(event);
  } else if (typeof resolver === "string") {
    key = getByPath(event, resolver);
  } else {
    key = provider.getDefaultIdempotencyKey?.(event, input) ?? provider.getEventId(event, input);
  }

  if (!key || typeof key !== "string") {
    throw new SafeHookError(
      "MISSING_IDEMPOTENCY_KEY",
      "Unable to resolve webhook idempotency key.",
    );
  }

  return key;
}

function getByPath(value: unknown, path: string): string | undefined {
  const result = path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);

  if (result === undefined || result === null) return undefined;
  return String(result);
}
