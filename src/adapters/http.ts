import { SafeHookError, type SafeHookErrorCode } from "../errors.js";
import type { HeaderMap, RawBody, SafeHookProcessInput, SafeHookProcessResult } from "../types.js";
import { processWebhook } from "../core.js";

export interface HttpAdapterInput<TEvent>
  extends Omit<SafeHookProcessInput<TEvent>, "rawBody" | "headers"> {
  rawBody: RawBody;
  headers: HeaderMap;
}

export interface SafeHookHttpErrorBody {
  error: {
    code: SafeHookErrorCode;
    message: string;
  };
}

export async function handleWebhookHttp<TEvent>(
  input: HttpAdapterInput<TEvent>,
): Promise<{ statusCode: number; body: SafeHookProcessResult<TEvent> | SafeHookHttpErrorBody }> {
  try {
    const result = await processWebhook(input);
    return {
      statusCode: result.status === "failed" ? 500 : 200,
      body: result,
    };
  } catch (error) {
    const safeHookError =
      error instanceof SafeHookError
        ? error
        : new SafeHookError("STORE_FAILED", "SafeHook request handling failed.", { cause: error });

    return {
      statusCode: errorStatusCode(safeHookError.code),
      body: {
        error: {
          code: safeHookError.code,
          message: safeHookError.message,
        },
      },
    };
  }
}

function errorStatusCode(code: SafeHookErrorCode): number {
  switch (code) {
    case "INVALID_SIGNATURE":
      return 401;
    case "PROVIDER_PARSE_FAILED":
    case "MISSING_IDEMPOTENCY_KEY":
    case "MISSING_EVENT_METADATA":
      return 400;
    case "STORE_FAILED":
      return 500;
    default:
      return 409;
  }
}
