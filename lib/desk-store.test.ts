import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairStoredRules } from "./desk-store";
import type { ShelfRule } from "./types";

function rule(name: string, prepped: string): ShelfRule {
  return {
    id: `ready:${name.toLowerCase()}`,
    sectionId: "ready",
    category: "Toppings",
    name,
    aliases: [],
    sameAs: [],
    prepped,
  };
}

describe("stored chart repair", () => {
  it("puts pineapple and olives back to 10 days when a saved chart says 25", () => {
    const repaired = repairStoredRules([
      rule("Pepperdew Piquante Peppers", "25 days"),
      rule("Pineapple", "25 days"),
      rule("Olives", "25 days"),
      rule("Tuna", "6 days"),
    ]);
    assert.equal(repaired[0]?.prepped, "25 days");
    assert.equal(repaired[1]?.prepped, "10 days");
    assert.equal(repaired[2]?.prepped, "10 days");
    assert.equal(repaired[3]?.prepped, "6 days");
  });

  it("leaves a saved 10-day life unchanged", () => {
    const original = [rule("Pineapple", "10 days"), rule("Olives", "10 days")];
    const repaired = repairStoredRules(original);
    assert.equal(repaired[0], original[0]);
    assert.equal(repaired[1], original[1]);
  });
});
