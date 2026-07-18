import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { proxy } from "../proxy";

const KEY = "test-secret-key";

describe("proxy (dashboard gate)", () => {
  const originalKey = process.env.MCP_BEARER_KEY;

  beforeEach(() => {
    process.env.MCP_BEARER_KEY = KEY;
  });

  afterEach(() => {
    process.env.MCP_BEARER_KEY = originalKey;
  });

  it("rejects a request with no cookie and no key", async () => {
    const req = new NextRequest("https://example.com/");
    const res = await proxy(req);
    expect(res?.status).toBe(401);
  });

  it("rejects a request with the wrong key", async () => {
    const req = new NextRequest("https://example.com/?key=wrong");
    const res = await proxy(req);
    expect(res?.status).toBe(401);
  });

  it("redirects and sets a cookie on the correct key, stripping it from the URL", async () => {
    const req = new NextRequest("https://example.com/?key=" + KEY);
    const res = await proxy(req);
    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toBe("https://example.com/");
    const setCookie = res?.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sf_auth=");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("passes through when the cookie already holds the correct key", async () => {
    const req = new NextRequest("https://example.com/");
    req.cookies.set("sf_auth", KEY);
    const res = await proxy(req);
    // NextResponse.next() has no special status/location -- it's a pass-through.
    expect(res?.status).toBe(200);
    expect(res?.headers.get("location")).toBeNull();
  });

  it("rejects when the cookie holds the wrong key", async () => {
    const req = new NextRequest("https://example.com/");
    req.cookies.set("sf_auth", "wrong");
    const res = await proxy(req);
    expect(res?.status).toBe(401);
  });

  it("fails closed when MCP_BEARER_KEY is unset", async () => {
    delete process.env.MCP_BEARER_KEY;
    const req = new NextRequest("https://example.com/?key=anything");
    const res = await proxy(req);
    expect(res?.status).toBe(500);
  });
});
