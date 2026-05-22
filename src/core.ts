import { SafeHookError } from "./errors.js";
import { resolveIdempotencyKey } from "./idempotency.js";
import type {
  SafeHook,
  SafeHookContext,
  SafeHookOptions,
  SafeHookProcessInput,
  SafeHookProcessResult,
  SafeHookReplayInput,
  SafeHookReplayResult,
  StoredWebhook,
} from "./types.js";
import { emitHook, normalizeHeaders, rawBodyToString, serializeError } from "./utils.js";

export function createSafeHook<TEvent = unknown>(options: SafeHookOptions<TEvent>): SafeHook<TEvent> {
  return {
    process: (input) =>
      processWebhook(withDefined({
        ...input,
        store: input.store ?? options.store,
        storeRawBody: input.storeRawBody ?? options.storeRawBody,
        storeHeaders: input.storeHeaders ?? options.storeHeaders,
        storeEventPayload: input.storeEventPayload ?? options.storeEventPayload,
        hooks: mergeHooks(options.hooks, input.hooks),
        ttlMs: input.ttlMs ?? options.ttlMs,
      }) as SafeHookProcessInput<TEvent>),
    replay: (input) =>
      replayWebhook(withDefined({
        ...input,
        store: input.store ?? options.store,
        hooks: mergeHooks(options.hooks, input.hooks),
        ttlMs: input.ttlMs ?? options.ttlMs,
      }) as SafeHookReplayInput<TEvent>),
  };
}

export async function processWebhook<TEvent>(
  input: SafeHookProcessInput<TEvent>,
): Promise<SafeHookProcessResult<TEvent>> {
  const startedAt = new Date();
  const startTime = performance.now();
  const hooks = input.hooks;
  const store = input.store;

  if (!store) {
    throw new SafeHookError("STORE_FAILED", "SafeHook process requires a store.");
  }

  await emitHook(hooks, "onReceived", { at: startedAt });

  let verified: boolean;
  try {
    verified = await input.provider.verify({
      rawBody: input.rawBody,
      headers: input.headers,
      now: startedAt,
    });
  } catch (error) {
    throw new SafeHookError("INVALID_SIGNATURE", "Webhook signature verification failed.", {
      cause: error,
    });
  }

  if (!verified) {
    throw new SafeHookError("INVALID_SIGNATURE", "Webhook signature verification failed.");
  }

  let event: TEvent;
  try {
    event = await input.provider.parse({ rawBody: input.rawBody, headers: input.headers });
  } catch (error) {
    throw new SafeHookError("PROVIDER_PARSE_FAILED", "Webhook provider failed to parse event.", {
      cause: error,
    });
  }

  const parseInput = { rawBody: input.rawBody, headers: input.headers };
  const eventId = input.provider.getEventId(event, parseInput);
  const eventType = input.provider.getEventType(event, parseInput);
  if (!eventId || !eventType) {
    throw new SafeHookError("MISSING_EVENT_METADATA", "Provider did not return event id or type.");
  }

  const idempotencyKey = resolveIdempotencyKey(event, parseInput, input.provider, input.idempotencyKey);
  const stored = createStoredWebhook({
    key: idempotencyKey,
    provider: input.provider.name,
    eventId,
    eventType,
    startedAt,
    ...withDefined({
      providerMetadata: input.provider.getMetadata?.(event, parseInput),
      rawBody: input.storeRawBody ? rawBodyToString(input.rawBody) : undefined,
      headers: input.storeHeaders ? normalizeHeaders(input.headers) : undefined,
      eventPayload: input.storeEventPayload === false ? undefined : event,
      ttlMs: input.ttlMs,
    }),
  } as {
    key: string;
    provider: string;
    eventId: string;
    eventType: string;
    startedAt: Date;
    rawBody?: string;
    headers?: Record<string, string>;
    eventPayload?: TEvent;
    providerMetadata?: Record<string, unknown>;
    ttlMs?: number;
  });

  const claimInput = input.ttlMs
    ? { key: idempotencyKey, webhook: stored, ttlMs: input.ttlMs }
    : { key: idempotencyKey, webhook: stored };
  const claim = await storeClaim(store, claimInput);
  const context = createContext(claim.stored, claim.status !== "claimed", startedAt);

  if (claim.status === "duplicate" || claim.status === "in_progress") {
    const result: SafeHookProcessResult<TEvent> = {
      status: claim.status,
      event,
      stored: claim.stored,
      context,
      durationMs: elapsed(startTime),
    };
    await emitHook(hooks, "onDuplicate", { event, stored: claim.stored, context, result, at: new Date() }, claim.stored);
    return result;
  }

  await emitHook(hooks, "onClaimed", { event, stored: claim.stored, context, at: new Date() }, claim.stored);
  await emitHook(hooks, "onProcessing", { event, stored: claim.stored, context, at: new Date() }, claim.stored);

  try {
    await input.onEvent(event, context);
  } catch (error) {
    const failure = serializeError(error);
    await storeFail(store, { key: idempotencyKey, failedAt: new Date(), error: failure });
    const failed = (await storeGet(store, idempotencyKey)) ?? claim.stored;
    const result: SafeHookProcessResult<TEvent> = {
      status: "failed",
      event,
      stored: failed,
      context,
      error: failure,
      durationMs: elapsed(startTime),
    };
    await emitHook(hooks, "onFailed", { event, stored: failed, context, result, error: failure, at: new Date() }, failed);
    return result;
  }

  await storeComplete(store, { key: idempotencyKey, completedAt: new Date() });
  const completed = (await storeGet(store, idempotencyKey)) ?? claim.stored;
  const result: SafeHookProcessResult<TEvent> = {
    status: "succeeded",
    event,
    stored: completed,
    context,
    durationMs: elapsed(startTime),
  };
  await emitHook(hooks, "onSucceeded", { event, stored: completed, context, result, at: new Date() }, completed);
  return result;
}

export async function replayWebhook<TEvent>(
  input: SafeHookReplayInput<TEvent>,
): Promise<SafeHookReplayResult<TEvent>> {
  const startedAt = new Date();
  const startTime = performance.now();
  const store = input.store;

  if (!store) {
    throw new SafeHookError("STORE_FAILED", "SafeHook replay requires a store.");
  }

  const existing = await storeGet(store, input.key);
  if (!existing) {
    throw new SafeHookError("REPLAY_NOT_FOUND", `No stored webhook found for key "${input.key}".`);
  }

  if (existing.status === "succeeded" && !input.allowSucceeded) {
    throw new SafeHookError("REPLAY_NOT_ALLOWED", "Successful webhook replay requires allowSucceeded.");
  }

  if (!existing.eventPayload) {
    throw new SafeHookError("REPLAY_PAYLOAD_UNAVAILABLE", "Stored webhook does not contain replay payload.");
  }

  const claim = store.beginReplay
    ? await storeBeginReplay(
        store,
        input.ttlMs
          ? { key: input.key, stored: existing, startedAt, ttlMs: input.ttlMs }
          : { key: input.key, stored: existing, startedAt },
      )
    : await storeClaim(
        store,
        input.ttlMs
          ? {
              key: input.key,
              ttlMs: input.ttlMs,
              webhook: {
                ...existing,
                status: "processing",
                attempts: existing.attempts + 1,
                updatedAt: startedAt.toISOString(),
                startedAt: startedAt.toISOString(),
                history: [...existing.history, { status: "processing", at: startedAt.toISOString(), note: "replay" }],
              },
            }
          : {
              key: input.key,
              webhook: {
          ...existing,
          status: "processing",
          attempts: existing.attempts + 1,
          updatedAt: startedAt.toISOString(),
          startedAt: startedAt.toISOString(),
          history: [...existing.history, { status: "processing", at: startedAt.toISOString(), note: "replay" }],
              },
            },
      );

  if (claim.status !== "claimed") {
    return {
      status: claim.status,
      stored: claim.stored,
      durationMs: elapsed(startTime),
    };
  }

  const event = existing.eventPayload;
  const context = createContext(claim.stored, false, startedAt);

  await emitHook(input.hooks, "onProcessing", { event, stored: claim.stored, context, at: new Date() }, claim.stored);

  try {
    await input.onEvent(event, context);
  } catch (error) {
    const failure = serializeError(error);
    await storeFail(store, { key: input.key, failedAt: new Date(), error: failure });
    const failed = (await storeGet(store, input.key)) ?? claim.stored;
    const result: SafeHookReplayResult<TEvent> = {
      status: "failed",
      event,
      stored: failed,
      context,
      error: failure,
      durationMs: elapsed(startTime),
    };
    await emitHook(input.hooks, "onFailed", { event, stored: failed, context, result, error: failure, at: new Date() }, failed);
    return result;
  }

  await storeComplete(store, { key: input.key, completedAt: new Date() });
  const completed = (await storeGet(store, input.key)) ?? claim.stored;
  const result: SafeHookReplayResult<TEvent> = {
    status: "succeeded",
    event,
    stored: completed,
    context,
    durationMs: elapsed(startTime),
  };
  await emitHook(input.hooks, "onSucceeded", { event, stored: completed, context, result, at: new Date() }, completed);
  return result;
}

function createStoredWebhook<TEvent>(input: {
  key: string;
  provider: string;
  eventId: string;
  eventType: string;
  startedAt: Date;
  headers?: Record<string, string>;
  eventPayload?: TEvent;
  providerMetadata?: Record<string, unknown>;
  rawBody?: string;
  ttlMs?: number;
}): StoredWebhook<TEvent> {
  const now = input.startedAt.toISOString();
  return {
    version: 1,
    key: input.key,
    provider: input.provider,
    eventId: input.eventId,
    eventType: input.eventType,
    status: "processing",
    attempts: 1,
    createdAt: now,
    updatedAt: now,
    receivedAt: now,
    startedAt: now,
    ...(input.ttlMs ? { expiresAt: new Date(input.startedAt.getTime() + input.ttlMs).toISOString() } : {}),
    ...(input.providerMetadata ? { providerMetadata: input.providerMetadata } : {}),
    ...(input.rawBody ? { rawBody: input.rawBody } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(input.eventPayload ? { eventPayload: input.eventPayload } : {}),
    history: [
      { status: "received", at: now },
      { status: "processing", at: now },
    ],
  };
}

function createContext<TEvent>(
  stored: StoredWebhook<TEvent>,
  isDuplicate: boolean,
  startedAt: Date,
): SafeHookContext {
  return {
    provider: stored.provider,
    eventId: stored.eventId,
    eventType: stored.eventType,
    idempotencyKey: stored.key,
    isDuplicate,
    startedAt,
    attempt: stored.attempts,
  };
}

function elapsed(startTime: number): number {
  return Math.round((performance.now() - startTime) * 100) / 100;
}

function mergeHooks<TEvent>(
  base?: import("./types.js").SafeHookHooks<TEvent>,
  override?: import("./types.js").SafeHookHooks<TEvent>,
): import("./types.js").SafeHookHooks<TEvent> | undefined {
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

function withDefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

async function storeClaim<TEvent>(
  store: import("./types.js").SafeHookStore<TEvent>,
  input: import("./types.js").ClaimInput<TEvent>,
): Promise<import("./types.js").ClaimResult<TEvent>> {
  try {
    return await store.claim(input);
  } catch (error) {
    throw new SafeHookError("STORE_FAILED", "SafeHook store claim failed.", { cause: error });
  }
}

async function storeComplete<TEvent>(
  store: import("./types.js").SafeHookStore<TEvent>,
  input: import("./types.js").CompleteInput,
): Promise<void> {
  try {
    await store.complete(input);
  } catch (error) {
    throw new SafeHookError("STORE_FAILED", "SafeHook store completion update failed.", { cause: error });
  }
}

async function storeFail<TEvent>(
  store: import("./types.js").SafeHookStore<TEvent>,
  input: import("./types.js").FailInput,
): Promise<void> {
  try {
    await store.fail(input);
  } catch (error) {
    throw new SafeHookError("STORE_FAILED", "SafeHook store failure update failed.", { cause: error });
  }
}

async function storeGet<TEvent>(
  store: import("./types.js").SafeHookStore<TEvent>,
  key: string,
): Promise<StoredWebhook<TEvent> | null> {
  try {
    return await store.get(key);
  } catch (error) {
    throw new SafeHookError("STORE_FAILED", "SafeHook store read failed.", { cause: error });
  }
}

async function storeBeginReplay<TEvent>(
  store: import("./types.js").SafeHookStore<TEvent>,
  input: import("./types.js").ReplayClaimInput<TEvent>,
): Promise<import("./types.js").ClaimResult<TEvent>> {
  try {
    return await store.beginReplay!(input);
  } catch (error) {
    throw new SafeHookError("STORE_FAILED", "SafeHook store replay claim failed.", { cause: error });
  }
}
