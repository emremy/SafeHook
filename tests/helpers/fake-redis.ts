import type { RedisLikeClient } from "../../src/index.ts";

interface RedisEntry {
  value: string;
  expiresAt?: number;
}

export class FakeRedisClient implements RedisLikeClient {
  private readonly records = new Map<string, RedisEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  get(key: string): string | null {
    const entry = this.records.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= this.now()) {
      this.records.delete(key);
      return null;
    }
    return entry.value;
  }

  del(key: string): number {
    return this.records.delete(key) ? 1 : 0;
  }

  set(
    key: string,
    value: string,
    mode?: "NX" | "XX",
    expiryMode?: "PX",
    ttlMs?: number,
  ): "OK" | null {
    const exists = this.get(key) !== null;
    if (mode === "NX" && exists) return null;
    if (mode === "XX" && !exists) return null;
    this.records.set(key, {
      value,
      ...(expiryMode === "PX" && ttlMs ? { expiresAt: this.now() + ttlMs } : {}),
    });
    return "OK";
  }
}
