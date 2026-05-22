export type SafeHookErrorCode =
  | "INVALID_SIGNATURE"
  | "PROVIDER_PARSE_FAILED"
  | "MISSING_IDEMPOTENCY_KEY"
  | "MISSING_EVENT_METADATA"
  | "HANDLER_FAILED"
  | "STORE_FAILED"
  | "REPLAY_NOT_FOUND"
  | "REPLAY_NOT_ALLOWED"
  | "REPLAY_PAYLOAD_UNAVAILABLE";

export class SafeHookError extends Error {
  readonly code: SafeHookErrorCode;
  readonly cause?: unknown;

  constructor(code: SafeHookErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.name = "SafeHookError";
    this.code = code;
    this.cause = options.cause;
  }
}
