import { createSafeHook, customProvider, memoryStore } from "safehook";

const safehook = createSafeHook({
  store: memoryStore<{ id: string; type: string }>(),
});

await safehook.process({
  rawBody: JSON.stringify({ id: "evt_local_1", type: "local.created" }),
  headers: {},
  provider: customProvider<{ id: string; type: string }>({
    getEventId: (event) => event.id,
    getEventType: (event) => event.type,
  }),
  onEvent: async (event, ctx) => {
    console.log("processing", ctx.idempotencyKey, event.type);
  },
});
