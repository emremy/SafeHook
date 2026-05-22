# Optional Dashboard

Dashboard functionality is outside SafeHook core. The first supported surface is a read-only HTML explorer generator:

```ts
import { createDashboardHtml } from "safehook";

const html = createDashboardHtml({
  records: await store.listFailures?.() ?? [],
});
```

Use application-level authorization before exposing any event explorer. Stored records may contain payload data depending on the persistence options enabled by the application.
