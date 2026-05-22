import type { HeaderMap, RawBody } from "../types.js";
import { rawBodyToString } from "../utils.js";

export function parseJsonBody(rawBody: RawBody): unknown {
  return JSON.parse(rawBodyToString(rawBody));
}

export function constantHeaders(headers: HeaderMap): HeaderMap {
  return headers;
}
