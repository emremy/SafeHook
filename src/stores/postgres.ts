import type {
  ClaimInput,
  ClaimResult,
  CompleteInput,
  FailInput,
  ReplayClaimInput,
  SafeHookStore,
  StoredWebhook,
} from "../types.js";

export interface PostgresLikeClient {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface PgClient {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export type PostgresStoreOptions =
  | PgStoreOptions
  | PostgresLikeStoreOptions;

export interface PgStoreOptions extends PostgresStoreCommonOptions {
  mode: "pg";
}

export interface PostgresLikeStoreOptions extends PostgresStoreCommonOptions {
  mode?: "postgres-like";
}

export interface PostgresStoreCommonOptions {
  tableName?: string;
}

export function postgresStore<TEvent = unknown>(
  client: PgClient,
  options: PgStoreOptions,
): SafeHookStore<TEvent>;

export function postgresStore<TEvent = unknown>(
  client: PostgresLikeClient,
  options?: PostgresLikeStoreOptions,
): SafeHookStore<TEvent>;

export function postgresStore<TEvent = unknown>(
  client: PgClient | PostgresLikeClient,
  options: PostgresStoreOptions = {},
): SafeHookStore<TEvent> {
  const table = quoteIdentifier(options.tableName ?? "safehook_webhooks");
  const commands = createPostgresCommands(client, options);

  return {
    async claim(input: ClaimInput<TEvent>): Promise<ClaimResult<TEvent>> {
      const inserted = await commands.query<{ record: StoredWebhook<TEvent> }>(
        `insert into ${table} (key, status, record)
         values ($1, $2, $3::jsonb)
         on conflict (key) do nothing
         returning record`,
        [input.key, input.webhook.status, JSON.stringify(input.webhook)],
      );

      if (inserted.rows[0]) {
        return { status: "claimed", stored: inserted.rows[0].record };
      }

      const existing = await this.get(input.key);
      if (existing?.status === "processing") {
        return { status: "in_progress", stored: existing };
      }
      return { status: "duplicate", stored: existing ?? input.webhook };
    },

    async complete(input: CompleteInput): Promise<void> {
      await updateRecord<TEvent>(commands, table, input.key, (stored) => ({
        ...stored,
        status: "succeeded",
        updatedAt: input.completedAt.toISOString(),
        completedAt: input.completedAt.toISOString(),
        history: [...stored.history, { status: "succeeded", at: input.completedAt.toISOString() }],
      }));
    },

    async fail(input: FailInput): Promise<void> {
      await updateRecord<TEvent>(commands, table, input.key, (stored) => ({
        ...stored,
        status: "failed",
        updatedAt: input.failedAt.toISOString(),
        failedAt: input.failedAt.toISOString(),
        failure: input.error,
        history: [...stored.history, { status: "failed", at: input.failedAt.toISOString() }],
      }));
    },

    async get(key: string): Promise<StoredWebhook<TEvent> | null> {
      const result = await commands.query<{ record: StoredWebhook<TEvent> }>(
        `select record from ${table} where key = $1`,
        [key],
      );
      return result.rows[0]?.record ?? null;
    },

    async beginReplay(input: ReplayClaimInput<TEvent>): Promise<ClaimResult<TEvent>> {
      const existing = await this.get(input.key);
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

      const updatedReplay = await commands.query(
        `update ${table} set status = $2, record = $3::jsonb, updated_at = now()
         where key = $1 and status = $4`,
        [input.key, replaying.status, JSON.stringify(replaying), existing.status],
      );
      if (updatedReplay.rowCount !== 1) {
        const updated = await this.get(input.key);
        return updated
          ? { status: updated.status === "processing" ? "in_progress" : "duplicate", stored: updated }
          : { status: "duplicate", stored: existing };
      }
      return { status: "claimed", stored: replaying };
    },

    async listFailures(): Promise<StoredWebhook<TEvent>[]> {
      const result = await commands.query<{ record: StoredWebhook<TEvent> }>(
        `select record from ${table} where status = $1 order by updated_at desc`,
        ["failed"],
      );
      return result.rows.map((row) => row.record);
    },
  };
}

interface PostgresCommands {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

function createPostgresCommands(
  client: PgClient | PostgresLikeClient,
  _options: PostgresStoreOptions,
): PostgresCommands {
  return {
    query: (sql, params) => client.query(sql, params),
  };
}

async function updateRecord<TEvent>(
  client: PostgresCommands,
  table: string,
  key: string,
  updater: (stored: StoredWebhook<TEvent>) => StoredWebhook<TEvent>,
): Promise<void> {
  const result = await client.query<{ record: StoredWebhook<TEvent> }>(
    `select record from ${table} where key = $1`,
    [key],
  );
  const existing = result.rows[0]?.record;
  if (!existing) return;
  const updated = updater(existing);
  await client.query(
    `update ${table} set status = $2, record = $3::jsonb, updated_at = now() where key = $1`,
    [key, updated.status, JSON.stringify(updated)],
  );
}

function quoteIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier: ${value}`);
  }
  return `"${value}"`;
}
