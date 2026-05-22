#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { memoryStore } from "../stores/memory.js";
import type { SafeHookStore } from "../types.js";

async function main(args: string[]): Promise<void> {
  const [command, key] = args;
  const store = await loadStoreFromFile();

  if (command === "inspect" && key) {
    const stored = await store.get(key);
    console.log(JSON.stringify(stored, null, 2));
    return;
  }

  if (command === "failures") {
    if (!store.listFailures) {
      console.error("Configured store does not support listFailures.");
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(await store.listFailures(), null, 2));
    return;
  }

  if (command === "replay") {
    console.error("CLI replay needs application handler wiring. Use the programmatic replay API.");
    process.exitCode = 1;
    return;
  }

  console.log(`Usage:
  safehook inspect <key>
  safehook failures
  safehook replay <key>`);
}

async function loadStoreFromFile(): Promise<SafeHookStore> {
  const file = process.env.SAFEHOOK_MEMORY_STORE_FILE;
  if (!file) return memoryStore();

  const rows = JSON.parse(await readFile(file, "utf8")) as unknown[];
  const store = memoryStore();
  for (const row of rows) {
    if (!isStoredRow(row)) continue;
    await store.claim({ key: row.key, webhook: row });
    if (row.status === "succeeded") {
      await store.complete({ key: row.key, completedAt: new Date(row.completedAt ?? row.updatedAt) });
    } else if (row.status === "failed" && row.failure) {
      await store.fail({ key: row.key, failedAt: new Date(row.failedAt ?? row.updatedAt), error: row.failure });
    }
  }
  return store;
}

function isStoredRow(value: unknown): value is Parameters<SafeHookStore["claim"]>[0]["webhook"] {
  return Boolean(value && typeof value === "object" && "key" in value && "status" in value);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
