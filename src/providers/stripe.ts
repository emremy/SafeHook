import { createHmac, timingSafeEqual } from "node:crypto";
import type { ParseInput, WebhookProvider } from "../types.js";
import { getHeader, rawBodyToString } from "../utils.js";
import { parseJsonBody } from "./json.js";

export interface StripeEventObject {
  object: string;
  id?: string;
  [key: string]: unknown;
}

export interface StripeEventData<TObject extends StripeEventObject = StripeEventObject> {
  object: TObject;
  previous_attributes?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface StripeEventRequest {
  id: string | null;
  idempotency_key?: string | null;
  [key: string]: unknown;
}

export interface StripeEvent<TType extends string = string, TObject extends StripeEventObject = StripeEventObject> {
  id: string;
  object: "event";
  type: TType;
  api_version?: string | null;
  account?: string | null;
  context?: string | null;
  created: number;
  data: StripeEventData<TObject>;
  livemode: boolean;
  pending_webhooks: number;
  request?: StripeEventRequest | null;
  [key: string]: unknown;
}

export interface StripeCheckoutSessionObject extends StripeEventObject {
  object: "checkout.session";
  id: string;
  payment_status?: string;
  [key: string]: unknown;
}

export interface StripeInvoiceObject extends StripeEventObject {
  object: "invoice";
  id: string;
  status?: string | null;
  customer?: string | StripeEventObject | null;
  subscription?: string | StripeEventObject | null;
  [key: string]: unknown;
}

export interface StripePaymentIntentObject extends StripeEventObject {
  object: "payment_intent";
  id: string;
  status?: string;
  customer?: string | StripeEventObject | null;
  [key: string]: unknown;
}

export type StripeCheckoutSessionEvent<TType extends string = string> = StripeEvent<
  TType,
  StripeCheckoutSessionObject
>;

export type StripeInvoiceEvent<TType extends string = string> = StripeEvent<TType, StripeInvoiceObject>;

export type StripePaymentIntentEvent<TType extends string = string> = StripeEvent<
  TType,
  StripePaymentIntentObject
>;

export interface StripeProviderOptions {
  secret: string;
  toleranceSeconds?: number;
}

export function stripe<
  TType extends string = string,
  TObject extends StripeEventObject = StripeEventObject,
>(options: StripeProviderOptions): WebhookProvider<StripeEvent<TType, TObject>> {
  const toleranceSeconds = options.toleranceSeconds ?? 300;

  return {
    name: "stripe",
    verify(input) {
      const signature = getHeader(input.headers, "stripe-signature");
      if (!signature) return false;
      const parts = parseStripeSignature(signature);
      if (!parts.timestamp || parts.signatures.length === 0) return false;

      const ageSeconds = Math.abs(input.now.getTime() / 1000 - parts.timestamp);
      if (ageSeconds > toleranceSeconds) return false;

      const payload = `${parts.timestamp}.${rawBodyToString(input.rawBody)}`;
      const expected = createHmac("sha256", options.secret).update(payload).digest("hex");
      return parts.signatures.some((candidate) => safeEqualHex(candidate, expected));
    },
    parse(input) {
      return parseJsonBody(input.rawBody) as StripeEvent<TType, TObject>;
    },
    getEventId(event) {
      return event.id;
    },
    getEventType(event) {
      return event.type;
    },
    getDefaultIdempotencyKey(event: StripeEvent<TType, TObject>, _input: ParseInput) {
      return event.id;
    },
  };
}

function parseStripeSignature(value: string): { timestamp?: number; signatures: string[] } {
  const result: { timestamp?: number; signatures: string[] } = { signatures: [] };
  for (const part of value.split(",")) {
    const [key, raw] = part.split("=", 2);
    if (key === "t" && raw) result.timestamp = Number(raw);
    if (key === "v1" && raw) result.signatures.push(raw);
  }
  return result;
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
