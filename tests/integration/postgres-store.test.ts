import { describe, expect, it } from "vitest";
import { postgresStore, type PostgresLikeClient, type StoredWebhook } from "../../src/index.ts";
import { FakePostgresClient } from "../helpers/fake-postgres.js";
import { createStoredWebhook } from "../helpers/stored.js";

describe("postgres store adapter", () => {
  it("uses insert-on-conflict claim semantics", async () => {
    const client = new FakePostgresClient();
    const store = postgresStore(client);
    const stored = createStoredWebhook("evt_pg_claim");

    const first = await store.claim({ key: stored.key, webhook: stored });
    const second = await store.claim({ key: stored.key, webhook: stored });

    expect(first.status).toBe("claimed");
    expect(second.status).toBe("in_progress");
    expect(client.statements.some((sql) => sql.toLowerCase().includes("on conflict"))).toBe(true);
  });

  it("tracks completion, failure listing, and replay state", async () => {
    const client = new FakePostgresClient();
    const store = postgresStore(client);
    const done = createStoredWebhook("evt_pg_done");
    const failed = createStoredWebhook("evt_pg_failed");

    await store.claim({ key: done.key, webhook: done });
    await store.claim({ key: failed.key, webhook: failed });
    await store.complete({ key: done.key, completedAt: new Date("2026-01-01T00:00:01.000Z") });
    await store.fail({
      key: failed.key,
      failedAt: new Date("2026-01-01T00:00:02.000Z"),
      error: { name: "Error", message: "handler failed" },
    });

    expect((await store.get(done.key))?.status).toBe("succeeded");
    expect(await store.listFailures?.()).toMatchObject([
      { key: failed.key, status: "failed", failure: { message: "handler failed" } },
    ]);

    const replay = await store.beginReplay?.({
      key: failed.key,
      stored: failed,
      startedAt: new Date("2026-01-01T00:00:03.000Z"),
    });

    expect(replay).toMatchObject({
      status: "claimed",
      stored: { status: "processing", attempts: 2 },
    });
  });

  it("rejects unsafe table identifiers", () => {
    const client = new FakePostgresClient();
    expect(() => postgresStore(client, { tableName: "safehook; drop table users" })).toThrow(
      "Invalid PostgreSQL identifier",
    );
  });

  it("uses a compare-and-set status guard for concurrent replay claims", async () => {
    const client = new FakePostgresClient();
    const store = postgresStore(client);
    const failed = createStoredWebhook("evt_pg_replay_guard", { status: "failed" });

    await store.claim({ key: failed.key, webhook: failed });
    await store.fail({
      key: failed.key,
      failedAt: new Date("2026-01-01T00:00:01.000Z"),
      error: { name: "Error", message: "handler failed" },
    });

    const first = await store.beginReplay?.({
      key: failed.key,
      stored: failed,
      startedAt: new Date("2026-01-01T00:00:02.000Z"),
    });
    const second = await store.beginReplay?.({
      key: failed.key,
      stored: failed,
      startedAt: new Date("2026-01-01T00:00:02.000Z"),
    });

    expect(first).toMatchObject({ status: "claimed", stored: { attempts: 2 } });
    expect(second).toMatchObject({ status: "in_progress" });
    expect(client.statements.some((sql) => sql.toLowerCase().includes("and status = $4"))).toBe(true);
  });

  it("returns in_progress when a stale replay update loses the status compare-and-set", async () => {
    const failed = createStoredWebhook("evt_pg_stale_replay", { status: "failed" });
    const processing = {
      ...failed,
      status: "processing" as const,
      attempts: 2,
    };
    const store = postgresStore(new StaleReplayPostgresClient(failed, processing));

    const result = await store.beginReplay?.({
      key: failed.key,
      stored: failed,
      startedAt: new Date("2026-01-01T00:00:02.000Z"),
    });

    expect(result).toMatchObject({
      status: "in_progress",
      stored: { key: failed.key, status: "processing", attempts: 2 },
    });
  });
});

class StaleReplayPostgresClient implements PostgresLikeClient {
  private selectCount = 0;

  constructor(
    private readonly stale: StoredWebhook,
    private readonly current: StoredWebhook,
  ) {}

  async query<T = unknown>(sql: string): Promise<{ rows: T[]; rowCount: number }> {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("select record")) {
      this.selectCount += 1;
      const record = this.selectCount === 1 ? this.stale : this.current;
      return { rows: [{ record } as T], rowCount: 1 };
    }
    if (normalized.startsWith("update")) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected SQL in stale replay fake: ${sql}`);
  }
}
