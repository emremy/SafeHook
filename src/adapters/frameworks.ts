import type { HeaderMap, RawBody, SafeHookProcessInput, SafeHookProcessResult } from "../types.js";
import { processWebhook } from "../core.js";

export type WebhookRequestReader<TRequest> = (request: TRequest) => Promise<{
  rawBody: RawBody;
  headers: HeaderMap;
}> | {
  rawBody: RawBody;
  headers: HeaderMap;
};

export interface FrameworkAdapterOptions<TRequest, TEvent>
  extends Omit<SafeHookProcessInput<TEvent>, "rawBody" | "headers"> {
  readRequest: WebhookRequestReader<TRequest>;
}

export function createFrameworkAdapter<TRequest, TEvent>(
  options: FrameworkAdapterOptions<TRequest, TEvent>,
): (request: TRequest) => Promise<SafeHookProcessResult<TEvent>> {
  return async (request) => {
    const { rawBody, headers } = await options.readRequest(request);
    return processWebhook({
      ...options,
      rawBody,
      headers,
    });
  };
}

export const createExpressAdapter = createFrameworkAdapter;
export const createFastifyAdapter = createFrameworkAdapter;
export const createHonoAdapter = createFrameworkAdapter;
export const createNextRouteHandlerAdapter = createFrameworkAdapter;
