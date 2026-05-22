import type {
  ClaimInput,
  ClaimResult,
  CompleteInput,
  FailInput,
  ReplayClaimInput,
  SafeHookStore,
  StoredWebhook,
} from "../types.js";

export interface RedisLikeClient {
  get(key: string): Promise<string | null> | string | null;
  del?(key: string): Promise<number> | number;
  set(
    key: string,
    value: string,
    mode?: "NX" | "XX",
    expiryMode?: "PX",
    ttlMs?: number,
  ): Promise<"OK" | null> | "OK" | null;
}

export interface NodeRedisClient {
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  set(
    key: string,
    value: string,
    options?: {
      NX?: boolean;
      XX?: boolean;
      PX?: number;
    },
  ): Promise<string | null>;
}

export type RedisStoreOptions =
  | NodeRedisStoreOptions
  | RedisLikeStoreOptions;

export interface NodeRedisStoreOptions extends RedisStoreCommonOptions {
  mode: "node-redis";
}

export interface RedisLikeStoreOptions extends RedisStoreCommonOptions {
  mode?: "redis-like";
}

export interface RedisStoreCommonOptions {
  prefix?: string;
  replayLockTtlMs?: number;
}

export function redisStore<TEvent = unknown>(
  client: NodeRedisClient,
  options: NodeRedisStoreOptions,
): SafeHookStore<TEvent>;

export function redisStore<TEvent = unknown>(
  client: RedisLikeClient,
  options?: RedisLikeStoreOptions,
): SafeHookStore<TEvent>;

export function redisStore<TEvent = unknown>(
  client: NodeRedisClient | RedisLikeClient,
  options: RedisStoreOptions = {},
): SafeHookStore<TEvent> {
  const prefix = options.prefix ?? "safehook";
  const replayLockTtlMs = options.replayLockTtlMs ?? 300_000;
  const commands = createRedisCommands(client, options);

  return {
    async claim(input: ClaimInput<TEvent>): Promise<ClaimResult<TEvent>> {
      const key = withPrefix(prefix, input.key);
      const value = JSON.stringify(input.webhook);
      const result = input.ttlMs
        ? await commands.setNx(key, value, input.ttlMs)
        : await commands.setNx(key, value);

      if (result === "OK") {
        return { status: "claimed", stored: input.webhook };
      }

      const existing = await getStored<TEvent>(commands, key);
      if (existing?.status === "processing") {
        return { status: "in_progress", stored: existing };
      }
      return { status: "duplicate", stored: existing ?? input.webhook };
    },

    async complete(input: CompleteInput): Promise<void> {
      await update(commands, withPrefix(prefix, input.key), (stored) => ({
        ...stored,
        status: "succeeded",
        updatedAt: input.completedAt.toISOString(),
        completedAt: input.completedAt.toISOString(),
        history: [...stored.history, { status: "succeeded", at: input.completedAt.toISOString() }],
      }));
      await commands.del(replayLockKey(prefix, input.key));
    },

    async fail(input: FailInput): Promise<void> {
      await update(commands, withPrefix(prefix, input.key), (stored) => ({
        ...stored,
        status: "failed",
        updatedAt: input.failedAt.toISOString(),
        failedAt: input.failedAt.toISOString(),
        failure: input.error,
        history: [...stored.history, { status: "failed", at: input.failedAt.toISOString() }],
      }));
      await commands.del(replayLockKey(prefix, input.key));
    },

    async get(key: string): Promise<StoredWebhook<TEvent> | null> {
      return getStored<TEvent>(commands, withPrefix(prefix, key));
    },

    async beginReplay(input: ReplayClaimInput<TEvent>): Promise<ClaimResult<TEvent>> {
      const key = withPrefix(prefix, input.key);
      const lockResult = await commands.setNx(
        replayLockKey(prefix, input.key),
        input.startedAt.toISOString(),
        replayLockTtlMs,
      );
      if (lockResult !== "OK") {
        const locked = await getStored<TEvent>(commands, key);
        return locked
          ? { status: "in_progress", stored: locked }
          : { status: "in_progress", stored: input.stored };
      }
      const existing = await getStored<TEvent>(commands, key);
      if (!existing) return { status: "claimed", stored: input.stored };
      if (existing.status === "processing") {
        return { status: "in_progress", stored: existing };
      }

      const { completedAt, failedAt, failure, ...base } = existing;
      void completedAt;
      void failedAt;
      void failure;
      const replaying: StoredWebhook<TEvent> = {
        ...base,
        status: "processing",
        attempts: existing.attempts + 1,
        updatedAt: input.startedAt.toISOString(),
        startedAt: input.startedAt.toISOString(),
        history: [
          ...existing.history,
          { status: "processing", at: input.startedAt.toISOString(), note: "replay" },
        ],
      };
      await commands.setXx(key, JSON.stringify(replaying));
      return { status: "claimed", stored: replaying };
    },
  };
}

interface RedisCommands {
  get(key: string): Promise<string | null>;
  setNx(key: string, value: string, ttlMs?: number): Promise<"OK" | null>;
  setXx(key: string, value: string): Promise<"OK" | null>;
  del(key: string): Promise<number>;
}

function createRedisCommands(
  client: NodeRedisClient | RedisLikeClient,
  options: RedisStoreOptions,
): RedisCommands {
  if (options.mode === "node-redis") {
    const nodeRedis = client as NodeRedisClient;
    return {
      get: (key) => nodeRedis.get(key),
      async setNx(key, value, ttlMs) {
        const result = await nodeRedis.set(key, value, {
          NX: true,
          ...(ttlMs ? { PX: ttlMs } : {}),
        });
        return result === "OK" ? "OK" : null;
      },
      async setXx(key, value) {
        const result = await nodeRedis.set(key, value, { XX: true });
        return result === "OK" ? "OK" : null;
      },
      del: (key) => nodeRedis.del(key),
    };
  }

  const redisLike = client as RedisLikeClient;
  return {
    get: (key) => Promise.resolve(redisLike.get(key)),
    setNx: (key, value, ttlMs) =>
      Promise.resolve(ttlMs ? redisLike.set(key, value, "NX", "PX", ttlMs) : redisLike.set(key, value, "NX")),
    setXx: (key, value) => Promise.resolve(redisLike.set(key, value, "XX")),
    del: (key) => Promise.resolve(redisLike.del?.(key) ?? 0),
  };
}

async function getStored<TEvent>(
  client: RedisCommands,
  key: string,
): Promise<StoredWebhook<TEvent> | null> {
  const value = await client.get(key);
  return value ? (JSON.parse(value) as StoredWebhook<TEvent>) : null;
}

async function update<TEvent>(
  client: RedisCommands,
  key: string,
  updater: (stored: StoredWebhook<TEvent>) => StoredWebhook<TEvent>,
): Promise<void> {
  const existing = await getStored<TEvent>(client, key);
  if (!existing) return;
  await client.setXx(key, JSON.stringify(updater(existing)));
}

function withPrefix(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

function replayLockKey(prefix: string, key: string): string {
  return `${prefix}:replay-lock:${key}`;
}
