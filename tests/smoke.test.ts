import { describe, expect, it } from "vitest";

describe("test runner wiring", () => {
  it("runs a vitest test to completion", () => {
    expect(1 + 1).toBe(2);
  });
});
