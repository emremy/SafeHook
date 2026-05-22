import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { github, stripe } from "../../src/index.ts";

describe("provider security behavior", () => {
  it("rejects expired Stripe timestamps", async () => {
    const secret = "whsec_test";
    const rawBody = JSON.stringify({ id: "evt_old", type: "charge.succeeded" });
    const timestamp = 1_700_000_000;
    const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const provider = stripe({ secret, toleranceSeconds: 300 });

    await expect(
      Promise.resolve(
        provider.verify({
          rawBody,
          headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
          now: new Date((timestamp + 301) * 1000),
        }),
      ),
    ).resolves.toBe(false);
  });

  it("rejects GitHub signatures for tampered bodies", async () => {
    const secret = "github_secret";
    const signedBody = JSON.stringify({ action: "opened" });
    const tamperedBody = JSON.stringify({ action: "closed" });
    const signature = "sha256=" + createHmac("sha256", secret).update(signedBody).digest("hex");
    const provider = github({ secret });

    await expect(
      Promise.resolve(
        provider.verify({
          rawBody: tamperedBody,
          headers: { "x-hub-signature-256": signature },
          now: new Date(),
        }),
      ),
    ).resolves.toBe(false);
  });
});
