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

  it("puts pepperdew back to 25 days when a saved chart copied the previous row", () => {
    const repaired = repairStoredRules([
      rule("Pepperdew Piquante Peppers", "11 days"),
      rule("Pineapple", "10 days"),
    ]);
    assert.equal(repaired[0]?.prepped, "25 days");
    assert.equal(repaired[1]?.prepped, "10 days");
  });

  it("puts sliced gherkins back to 16 days when a saved chart copied the previous row", () => {
    const repaired = repairStoredRules([
      rule("Sliced Gherkins", "8 days"),
      rule("Cheese Sauce", "8 days"),
    ]);
    assert.equal(repaired[0]?.prepped, "16 days");
    assert.equal(repaired[1]?.prepped, "8 days");
  });

  it("moves a saved mac and cheese row from Desserts to Sides", () => {
    const saved: ShelfRule = {
      id: "frozen:mac-n-cheese",
      sectionId: "frozen",
      category: "Desserts",
      name: "Mac n Cheese",
      aliases: [],
      sameAs: [],
      fromDelivery: "6 days",
      inUse: "48 hours prepped",
    };
    const [repaired] = repairStoredRules([saved]);
    assert.equal(repaired?.category, "Sides");
    assert.equal(repaired?.fromDelivery, "6 days");
    assert.equal(repaired?.inUse, "48 hours prepped");
  });

  it("moves a saved butter whirl row from Other to Desserts", () => {
    const saved: ShelfRule = {
      id: "pack:butter-whirl",
      sectionId: "pack",
      category: "Other",
      name: "Butter Whirl",
      aliases: [],
      sameAs: [],
      unopened: "Date on pack",
    };
    const [repaired] = repairStoredRules([saved]);
    assert.equal(repaired?.category, "Desserts");
    assert.equal(repaired?.unopened, "Date on pack");
  });

  it("leaves a saved 10-day life unchanged", () => {
    const original = [rule("Pineapple", "10 days"), rule("Olives", "10 days")];
    const repaired = repairStoredRules(original);
    assert.equal(repaired[0], original[0]);
    assert.equal(repaired[1], original[1]);
  });
});
