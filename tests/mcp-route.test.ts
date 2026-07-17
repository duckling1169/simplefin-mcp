import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEMO_ACCESS_URL = "https://demo:demo@beta-bridge.simplefin.org/simplefin";
const MCP_URL = new URL("https://mcp.test.local/mcp");

const originalAccessUrl = process.env.SIMPLEFIN_ACCESS_URL;
const originalBearerKey = process.env.MCP_BEARER_KEY;
const originalFetch = globalThis.fetch;

async function loadRoute() {
  vi.resetModules();
  return import("../app/mcp/route");
}

/** Bridges the MCP client transport's fetch calls straight to the route's exported handlers. */
function makeRouteFetch(route: Awaited<ReturnType<typeof loadRoute>>) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    if (req.method === "GET") return route.GET(req);
    if (req.method === "DELETE") return route.DELETE(req);
    return route.POST(req);
  }) as typeof fetch;
}

async function connectClient(route: Awaited<ReturnType<typeof loadRoute>>, headers?: Record<string, string>) {
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(MCP_URL, {
    fetch: makeRouteFetch(route),
    requestInit: headers ? { headers } : undefined,
  });
  await client.connect(transport);
  return client;
}

describe("MCP /mcp route", () => {
  beforeEach(() => {
    delete process.env.SIMPLEFIN_ACCESS_URL;
    delete process.env.MCP_BEARER_KEY;
  });

  afterEach(() => {
    process.env.SIMPLEFIN_ACCESS_URL = originalAccessUrl;
    process.env.MCP_BEARER_KEY = originalBearerKey;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejects a request with no bearer key before ever calling SimpleFin, without a bare 401", async () => {
    process.env.MCP_BEARER_KEY = "correct-key";
    const route = await loadRoute();

    const simplefinFetch = vi.fn();
    globalThis.fetch = simplefinFetch as unknown as typeof fetch;

    const res = await route.POST(
      new Request(MCP_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBeTruthy();
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(simplefinFetch).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong bearer key before ever calling SimpleFin", async () => {
    process.env.MCP_BEARER_KEY = "correct-key";
    const route = await loadRoute();

    const simplefinFetch = vi.fn();
    globalThis.fetch = simplefinFetch as unknown as typeof fetch;

    const res = await route.POST(
      new Request(MCP_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer wrong-key",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

    expect(res.status).toBe(401);
    expect(simplefinFetch).not.toHaveBeenCalled();
  });

  it("fails closed (rejects every request) when MCP_BEARER_KEY is unset, even with a key supplied", async () => {
    const route = await loadRoute();

    const res = await route.POST(
      new Request(MCP_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer anything",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("invokes get_balances and returns the same grouped-by-institution data as the dashboard, given the correct key (Authorization header)", async () => {
    process.env.MCP_BEARER_KEY = "correct-key";
    process.env.SIMPLEFIN_ACCESS_URL = DEMO_ACCESS_URL;
    const route = await loadRoute();

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [],
          accounts: [
            {
              id: "acct-1",
              name: "Checking",
              currency: "USD",
              balance: "1234.56",
              "balance-date": 1700000000,
              org: { name: "Demo Bank", domain: "demo.example" },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const client = await connectClient(route, { Authorization: "Bearer correct-key" });
    const result = await client.callTool({ name: "get_balances", arguments: {} });

    expect(result.isError).not.toBe(true);
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    expect(JSON.parse(text)).toEqual([
      {
        orgName: "Demo Bank",
        accounts: [
          {
            id: "acct-1",
            name: "Checking",
            orgName: "Demo Bank",
            currency: "USD",
            balance: "1234.56",
            balanceDate: 1700000000,
          },
        ],
      },
    ]);
  });

  it("accepts the correct key via a ?key= query param", async () => {
    process.env.MCP_BEARER_KEY = "correct-key";
    process.env.SIMPLEFIN_ACCESS_URL = DEMO_ACCESS_URL;
    const route = await loadRoute();

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [], accounts: [] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const url = new URL(MCP_URL);
    url.searchParams.set("key", "correct-key");
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(url, { fetch: makeRouteFetch(route) });
    await client.connect(transport);

    const result = await client.callTool({ name: "get_balances", arguments: {} });
    expect(result.isError).not.toBe(true);
  });

  it("never leaks the SimpleFin access URL or credential in a successful response", async () => {
    process.env.MCP_BEARER_KEY = "correct-key";
    process.env.SIMPLEFIN_ACCESS_URL = DEMO_ACCESS_URL;
    const route = await loadRoute();

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [], accounts: [] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const res = await route.POST(
      new Request(MCP_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer correct-key",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test-client", version: "0.0.0" },
          },
        }),
      }),
    );
    const body = await res.text();
    expect(body).not.toContain("demo:demo");
    expect(body).not.toContain(DEMO_ACCESS_URL);
  });

  it("never leaks the SimpleFin access URL or credential in an error response when SimpleFin fails", async () => {
    process.env.MCP_BEARER_KEY = "correct-key";
    process.env.SIMPLEFIN_ACCESS_URL = DEMO_ACCESS_URL;
    const route = await loadRoute();

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(`Unauthorized: ${DEMO_ACCESS_URL}/accounts`, { status: 401 })) as unknown as typeof fetch;

    const client = await connectClient(route, { Authorization: "Bearer correct-key" });
    const result = await client.callTool({ name: "get_balances", arguments: {} });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    expect(text).not.toContain("demo:demo");
    expect(text).not.toContain(DEMO_ACCESS_URL);

    const rejectRes = await route.POST(
      new Request(MCP_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} }),
      }),
    );
    const rejectBody = await rejectRes.text();
    expect(rejectBody).not.toContain("demo:demo");
    expect(rejectBody).not.toContain(DEMO_ACCESS_URL);
  });

  it("registers exactly one tool, get_balances, taking no required arguments", async () => {
    process.env.MCP_BEARER_KEY = "correct-key";
    const route = await loadRoute();

    const client = await connectClient(route, { Authorization: "Bearer correct-key" });
    const { tools } = await client.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_balances");
    expect(tools[0].inputSchema.required ?? []).toEqual([]);
  });
});
