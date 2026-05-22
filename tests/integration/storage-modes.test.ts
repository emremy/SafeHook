import { describe, expect, it } from "vitest";
import { postgresStore, redisStore, type NodeRedisClient, type PgClient } from "../../src/index.ts";
import { createStoredWebhook } from "../helpers/stored.js";

describe("storage client modes", () => {
  it("supports node-redis command shape without depending on redis", async () => {
    const client = new FakeNodeRedisClient();
    const store = redisStore(client, { mode: "node-redis", prefix: "mode-test" });
    const stored = createStoredWebhook("evt_node_redis_mode");

    const first = await store.claim({ key: stored.key, webhook: stored, ttlMs: 1000 });
    const second = await store.claim({ key: stored.key, webhook: stored });
    await store.complete({ key: stored.key, completedAt: new Date("2026-01-01T00:00:01.000Z") });

    expect(first.status).toBe("claimed");
    expect(second.status).toBe("in_progress");
    expect(client.setCalls).toContainEqual({
      key: "mode-test:evt_node_redis_mode",
      options: { NX: true, PX: 1000 },
    });
    expect(client.setCalls).toContainEqual({
      key: "mode-test:evt_node_redis_mode",
      options: { XX: true },
    });
    expect(client.deletedKeys).toContain("mode-test:replay-lock:evt_node_redis_mode");
  });

  it("supports pg query shape without depending on pg", async () => {
    const client = new FakePgClient();
    const store = postgresStore(client, { mode: "pg", tableName: "safehook_webhooks" });
    const stored = createStoredWebhook("evt_pg_mode");

    const first = await store.claim({ key: stored.key, webhook: stored });
    const second = await store.claim({ key: stored.key, webhook: stored });

    expect(first.status).toBe("claimed");
    expect(second.status).toBe("in_progress");
    expect(client.sql.some((sql) => sql.toLowerCase().includes("on conflict"))).toBe(true);
  });
});

class FakeNodeRedisClient implements NodeRedisClient {
  readonly values = new Map<string, string>();
  readonly setCalls: Array<{ key: string; options?: { NX?: boolean; XX?: boolean; PX?: number } }> = [];
  readonly deletedKeys: string[] = [];

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    this.deletedKeys.push(key);
    return this.values.delete(key) ? 1 : 0;
  }

  async set(
    key: string,
    value: string,
    options?: { NX?: boolean; XX?: boolean; PX?: number },
  ): Promise<string | null> {
    this.setCalls.push({ key, options });
    const exists = this.values.has(key);
    if (options?.NX && exists) return null;
    if (options?.XX && !exists) return null;
    this.values.set(key, value);
    return "OK";
  }
}

class FakePgClient implements PgClient {
  readonly rows = new Map<string, { status: string; record: unknown }>();
  readonly sql: string[] = [];

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    this.sql.push(sql);
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("insert into")) {
      const key = String(params[0]);
      if (this.rows.has(key)) return { rows: [], rowCount: 0 };
      const record = JSON.parse(String(params[2]));
      this.rows.set(key, { status: String(params[1]), record });
      return { rows: [{ record } as T], rowCount: 1 };
    }

    if (normalized.startsWith("select record")) {
      const row = this.rows.get(String(params[0]));
      return { rows: row ? ([{ record: row.record }] as T[]) : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.startsWith("update")) {
      const key = String(params[0]);
      const existing = this.rows.get(key);
      if (!existing) return { rows: [], rowCount: 0 };
      const record = JSON.parse(String(params[2]));
      this.rows.set(key, { status: String(params[1]), record });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }
}
