import { describe, expect, it } from "vitest";

import { claimUrlFromSetupToken, decryptAccessUrl, encryptAccessUrl, SetupTokenError } from "../lib/connections";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("connections", () => {
  it("round-trips the access URL only with the right key", () => {
    const ct = encryptAccessUrl("https://u:p@beta-bridge.simplefin.org/simplefin", "key-a");
    expect(decryptAccessUrl(ct, "key-a")).toBe("https://u:p@beta-bridge.simplefin.org/simplefin");
    expect(() => decryptAccessUrl(ct, "key-b")).toThrow();
  });

  it("accepts SimpleFin claim URLs and rejects anything else", () => {
    expect(claimUrlFromSetupToken(b64("https://beta-bridge.simplefin.org/simplefin/claim/abc")).hostname).toBe(
      "beta-bridge.simplefin.org",
    );
    for (const bad of ["http://beta-bridge.simplefin.org/x", "https://evil.example/x", "https://simplefin.org.evil.com/x", "junk"]) {
      expect(() => claimUrlFromSetupToken(b64(bad))).toThrow(SetupTokenError);
    }
  });
});
