import type {
  ClaimInput,
  ClaimResult,
  CompleteInput,
  FailInput,
  ReplayClaimInput,
  SafeHookStore,
  StoredWebhook,
} from "../types.js";

export interface MemoryStoreOptions {
  now?: () => Date;
}

export function memoryStore<TEvent = unknown>(options: MemoryStoreOptions = {}): SafeHookStore<TEvent> {
  const records = new Map<string, StoredWebhook<TEvent>>();
  const now = options.now ?? (() => new Date());

  function getActive(key: string): StoredWebhook<TEvent> | null {
    const stored = records.get(key);
    if (!stored) return null;

    if (stored.expiresAt && Date.parse(stored.expiresAt) <= now().getTime()) {
      const expired = transition(stored, "expired", now(), "ttl expired");
      records.set(key, expired);
      return expired;
    }

    return stored;
  }

  return {
    async claim(input: ClaimInput<TEvent>): Promise<ClaimResult<TEvent>> {
      const existing = getActive(input.key);
      if (existing && existing.status !== "expired") {
        if (existing.status === "processing") {
          return { status: "in_progress", stored: clone(existing) };
        }
        return { status: "duplicate", stored: clone(existing) };
      }

      const claimed = input.ttlMs
        ? {
            ...input.webhook,
            expiresAt: new Date(now().getTime() + input.ttlMs).toISOString(),
          }
        : input.webhook;
      records.set(input.key, clone(claimed));
      return { status: "claimed", stored: clone(claimed) };
    },

    async complete(input: CompleteInput): Promise<void> {
      const existing = records.get(input.key);
      if (!existing) return;
      records.set(input.key, {
        ...transition(existing, "succeeded", input.completedAt),
        completedAt: input.completedAt.toISOString(),
      });
    },

    async fail(input: FailInput): Promise<void> {
      const existing = records.get(input.key);
      if (!existing) return;
      records.set(input.key, {
        ...transition(existing, "failed", input.failedAt),
        failedAt: input.failedAt.toISOString(),
        failure: input.error,
      });
    },

    async get(key: string): Promise<StoredWebhook<TEvent> | null> {
      const stored = getActive(key);
      return stored ? clone(stored) : null;
    },

    async beginReplay(input: ReplayClaimInput<TEvent>): Promise<ClaimResult<TEvent>> {
      const existing = getActive(input.key);
      if (!existing) {
        return { status: "claimed", stored: clone(input.stored) };
      }
      if (existing.status === "processing") {
        return { status: "in_progress", stored: clone(existing) };
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
      records.set(input.key, replaying);
      return { status: "claimed", stored: clone(replaying) };
    },

    async listFailures(): Promise<StoredWebhook<TEvent>[]> {
      return [...records.values()].filter((record) => record.status === "failed").map(clone);
    },
  };
}

function transition<TEvent>(
  stored: StoredWebhook<TEvent>,
  status: StoredWebhook<TEvent>["status"],
  at: Date,
  note?: string,
): StoredWebhook<TEvent> {
  return {
    ...stored,
    status,
    updatedAt: at.toISOString(),
    history: [...stored.history, { status, at: at.toISOString(), ...(note ? { note } : {}) }],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
