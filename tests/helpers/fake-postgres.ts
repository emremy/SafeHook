import type { PostgresLikeClient, StoredWebhook } from "../../src/index.ts";

interface Row {
  key: string;
  status: string;
  record: StoredWebhook;
}

export class FakePostgresClient implements PostgresLikeClient {
  readonly rows = new Map<string, Row>();
  readonly statements: string[] = [];

  async query<T = unknown>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    this.statements.push(sql);
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("insert into")) {
      const key = String(params[0]);
      if (this.rows.has(key)) return { rows: [], rowCount: 0 };
      const record = JSON.parse(String(params[2])) as StoredWebhook;
      this.rows.set(key, { key, status: String(params[1]), record });
      return { rows: [{ record } as T], rowCount: 1 };
    }

    if (normalized.startsWith("select record") && normalized.includes("where key = $1")) {
      const row = this.rows.get(String(params[0]));
      return { rows: row ? ([{ record: row.record }] as T[]) : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.startsWith("select record") && normalized.includes("where status = $1")) {
      const status = String(params[0]);
      const rows = [...this.rows.values()]
        .filter((row) => row.status === status)
        .map((row) => ({ record: row.record }) as T);
      return { rows, rowCount: rows.length };
    }

    if (normalized.startsWith("update")) {
      const key = String(params[0]);
      const existing = this.rows.get(key);
      if (!existing) return { rows: [], rowCount: 0 };
      if (normalized.includes("and status = $4") && existing.status !== String(params[3])) {
        return { rows: [], rowCount: 0 };
      }
      const record = JSON.parse(String(params[2])) as StoredWebhook;
      this.rows.set(key, { key, status: String(params[1]), record });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in fake client: ${sql}`);
  }
}
