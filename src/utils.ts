import type { FailureMetadata, HeaderMap, RawBody, SafeHookHooks, StoredWebhook } from "./types.js";

export function rawBodyToString(rawBody: RawBody): string {
  if (typeof rawBody === "string") return rawBody;
  return Buffer.from(rawBody).toString("utf8");
}

export function normalizeHeaders(headers: HeaderMap): Record<string, string> {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const normalized: Record<string, string> = {};
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return normalized;
}

export function getHeader(headers: HeaderMap, name: string): string | undefined {
  return normalizeHeaders(headers)[name.toLowerCase()];
}

export function serializeError(error: unknown): FailureMetadata {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : JSON.stringify(error),
  };
}

export async function emitHook<TEvent>(
  hooks: SafeHookHooks<TEvent> | undefined,
  name: keyof SafeHookHooks<TEvent>,
  payload: Parameters<NonNullable<SafeHookHooks<TEvent>[typeof name]>>[0],
  stored?: StoredWebhook<TEvent>,
): Promise<void> {
  const hook = hooks?.[name];
  if (!hook) return;

  try {
    await hook(payload);
  } catch (error) {
    if (stored) {
      const metadata = serializeError(error);
      stored.providerMetadata = {
        ...stored.providerMetadata,
        hookErrors: [
          ...((stored.providerMetadata?.hookErrors as FailureMetadata[] | undefined) ?? []),
          { ...metadata, hook: name },
        ],
      };
    }
  }
}
