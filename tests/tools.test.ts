import { describe, expect, it } from "vitest";

import { flattenTransactions } from "@/lib/data";
import { mccCategory } from "@/lib/mcc";
import { parseAccountSet } from "@/lib/simplefin";
import {
  connectionStatus,
  filterTransactions,
  listHoldings,
  summarize,
} from "@/lib/tools";

import { loadFixture } from "./fixtures";

const V2 = loadFixture("account-set-v2.json") as Record<string, unknown>;

describe("tools", () => {
  const set = parseAccountSet(V2);
  const rows = flattenTransactions(set);

  it("filters by text, pending and amount", () => {
    expect(
      filterTransactions(rows, { query: "LATTE" }).map((t) => t.id),
    ).toEqual(["t2"]);
    expect(
      filterTransactions(rows, { includePending: false }).map((t) => t.id),
    ).toEqual(["t3", "t1"]);
    expect(filterTransactions(rows, { maxAmount: 0 }).map((t) => t.id)).toEqual(
      ["t2", "t1"],
    );
  });

  it("summarizes spending by category and payee", () => {
    const byCategory = summarize(rows, "category");
    expect(byCategory.totals).toEqual({
      spent: 70,
      received: 2000,
      net: 1930,
      transactions: 3,
    });
    expect(byCategory.groups.map((g) => g.key)).toEqual([
      "Groceries",
      "Restaurants & bars",
      "Uncategorized",
    ]);
    expect(summarize(rows, "payee", 1)).toMatchObject({
      groups: [{ key: "Grocer", spent: 50 }],
      omittedGroups: 2,
    });
  });

  it("reports holdings and connection errors", () => {
    expect(listHoldings(set)[0]?.holdings[0]).toMatchObject({
      symbol: "AAPL",
      gain: 1500,
    });
    expect(connectionStatus(set, 0).connections[0]).toMatchObject({
      institution: "Demo Bank",
      accounts: 1,
      errors: ["Re-authenticate Demo Bank"],
    });
  });

  it("maps merchant category codes", () => {
    expect(mccCategory("5411")).toBe("Groceries");
    expect(mccCategory("5542")).toBe("Gas");
    expect(mccCategory("8011")).toBe("Health care");
    expect(mccCategory(null)).toBe("Uncategorized");
  });
});
