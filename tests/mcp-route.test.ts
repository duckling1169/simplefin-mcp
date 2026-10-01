import { describe, expect, it, vi } from "vitest";

import { parseAccountSet } from "../lib/simplefin";

vi.mock("../lib/connections", () => ({
  loadConnection: async (key: string) =>
    key === "good-key"
      ? {
          key,
          keyHash: "hash",
          accessUrl: "https://u:p@bridge.example/simplefin",
        }
      : null,
}));

vi.mock("../lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/data")>();
  const snapshot = {
    ...parseAccountSet({
      connections: [{ conn_id: "C", org_name: "Demo Bank" }],
      accounts: [
        {
          id: "A",
          name: "Checking",
          conn_id: "C",
          currency: "USD",
          balance: "10.00",
          "balance-date": 1,
          transactions: [],
        },
      ],
    }),
    fetchedAt: 0,
    windowStart: 0,
  };
  return { ...actual, getSnapshot: async () => snapshot };
});

const { POST } = await import("../app/mcp/route");

function rpc(method: string, params: unknown, key = "good-key") {
  return POST(
    new Request(`https://test.local/mcp?key=${key}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
}

async function result(res: Response) {
  const text = await res.text();
  const json = text.startsWith("{")
    ? text
    : text
        .split("\n")
        .find((l) => l.startsWith("data:"))!
        .slice(5);
  return JSON.parse(json).result;
}

describe("/mcp", () => {
  it("rejects an unknown key with a plain Bearer challenge", async () => {
    const res = await rpc("tools/list", {}, "bad-key");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer realm="simplefin-mcp"',
    );
  });

  it("lists the tools", async () => {
    const { tools } = await result(await rpc("tools/list", {}));
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "get_connection_status",
      "get_holdings",
      "get_transactions",
      "list_accounts",
      "spending_summary",
    ]);
  });

  it("calls a tool with the connection's data", async () => {
    const { content } = await result(
      await rpc("tools/call", { name: "list_accounts", arguments: {} }),
    );
    expect(JSON.parse(content[0].text)).toMatchObject({
      netTotal: 10,
      institutions: [{ institution: "Demo Bank" }],
    });
  });
});
