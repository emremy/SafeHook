import type { StoredWebhook } from "../../src/index.ts";

export interface TestEvent {
  id: string;
  type: string;
  data?: {
    object?: {
      id?: string;
    };
  };
}

export function createStoredWebhook(
  key: string,
  overrides: Partial<StoredWebhook<TestEvent>> = {},
): StoredWebhook<TestEvent> {
  const now = new Date("2026-01-01T00:00:00.000Z").toISOString();
  return {
    version: 1,
    key,
    provider: "test",
    eventId: key,
    eventType: "test.event",
    status: "processing",
    attempts: 1,
    createdAt: now,
    updatedAt: now,
    receivedAt: now,
    startedAt: now,
    eventPayload: { id: key, type: "test.event" },
    history: [{ status: "processing", at: now }],
    ...overrides,
  };
}
