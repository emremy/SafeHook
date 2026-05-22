import type { ParseInput, VerifyInput, WebhookProvider } from "../types.js";
import { parseJsonBody } from "./json.js";

export interface CustomProviderOptions<TEvent> {
  name?: string;
  verify?: (input: VerifyInput) => Promise<boolean> | boolean;
  parse?: (input: ParseInput) => Promise<TEvent> | TEvent;
  getEventId: (event: TEvent, input: ParseInput) => string | undefined;
  getEventType: (event: TEvent, input: ParseInput) => string | undefined;
  getDefaultIdempotencyKey?: (event: TEvent, input: ParseInput) => string | undefined;
}

export function customProvider<TEvent = unknown>(
  options: CustomProviderOptions<TEvent>,
): WebhookProvider<TEvent> {
  return {
    name: options.name ?? "custom",
    verify: options.verify ?? (() => true),
    parse: options.parse ?? ((input) => parseJsonBody(input.rawBody) as TEvent),
    getEventId: options.getEventId,
    getEventType: options.getEventType,
    ...(options.getDefaultIdempotencyKey
      ? { getDefaultIdempotencyKey: options.getDefaultIdempotencyKey }
      : {}),
  };
}
