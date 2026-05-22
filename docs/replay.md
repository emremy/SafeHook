# Replay Guide

SafeHook replay is intentionally handler-driven. The store can preserve payloads and state, but the application must provide the business handler for replay.

```ts
await safehook.replay({
  key: "evt_123",
  onEvent: async (event, ctx) => {
    await processEvent(event, ctx);
  },
});
```

By default, succeeded events cannot be replayed. Pass `allowSucceeded: true` only for explicit operator actions.

Replay requires the stored record to contain `eventPayload`. If a custom production store omits payloads for compliance reasons, replay should be implemented through an application-specific source of truth.

If you set `storeEventPayload: false`, replay is intentionally unavailable for that record.
