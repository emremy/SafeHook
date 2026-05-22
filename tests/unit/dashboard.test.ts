import { describe, expect, it } from "vitest";
import { createDashboardHtml } from "../../src/index.ts";
import { createStoredWebhook } from "../helpers/stored.js";

describe("dashboard html", () => {
  it("escapes stored values before rendering", () => {
    const html = createDashboardHtml({
      records: [
        createStoredWebhook("<script>alert(1)</script>", {
          eventType: "\"xss\"",
          failure: { name: "Error", message: "<b>boom</b>" },
        }),
      ],
    });

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;xss&quot;");
    expect(html).toContain("&lt;b&gt;boom&lt;/b&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
