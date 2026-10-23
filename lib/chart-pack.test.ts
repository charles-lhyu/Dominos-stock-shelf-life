import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseChartPack } from "./chart-pack";

describe("parseChartPack", () => {
  it("accepts a minimal imported chart", () => {
    const result = parseChartPack({
      chart: {
        title: "Test chart",
        audience: "All stores",
        version: "Demo",
        issued: "2026-10-01",
        validUntil: "2026-12-31",
      },
      rules: [
        {
          sectionId: "frozen",
          category: "Toppings",
          name: "Pepperoni",
          fromDelivery: "12 days",
        },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pack.rules.length, 1);
    assert.equal(result.pack.rules[0].name, "Pepperoni");
    assert.equal(result.pack.sections[0].id, "frozen");
  });

  it("rejects empty rules", () => {
    const result = parseChartPack({ chart: { title: "X" }, rules: [] });
    assert.equal(result.ok, false);
  });
});
