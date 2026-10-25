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

  it("puts a saved mac and cheese row under Sides when it was filed as a dessert", () => {
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

  it("puts pack-dated butter whirl back under Other when it was refiled as a dessert", () => {
    const saved: ShelfRule = {
      id: "pack:butter-whirl",
      sectionId: "pack",
      category: "Desserts",
      name: "Butter Whirl",
      aliases: [],
      sameAs: [],
      unopened: "Date on pack",
    };
    const [repaired] = repairStoredRules([saved]);
    assert.equal(repaired?.category, "Other");
    assert.equal(repaired?.unopened, "Date on pack");
  });

  it("puts dough back under Dough when it was filed as Bases", () => {
    const saved: ShelfRule = {
      id: "chilled:standard-dough-all-sizes",
      sectionId: "chilled",
      category: "Bases",
      name: "Standard Dough (All sizes)",
      aliases: [],
      sameAs: [],
      unopened: "Date on tray",
      prepped: "BB date on tray +1 day",
    };
    const [repaired] = repairStoredRules([saved]);
    assert.equal(repaired?.category, "Dough");
  });

  it("leaves a saved 10-day life unchanged", () => {
    const original = [rule("Pineapple", "10 days"), rule("Olives", "10 days")];
    const repaired = repairStoredRules(original);
    assert.equal(repaired[0], original[0]);
    assert.equal(repaired[1], original[1]);
  });

  it("drops an invented inUse that only copied fromDelivery", () => {
    const saved: ShelfRule = {
      id: "frozen:pepperoni",
      sectionId: "frozen",
      category: "Toppings",
      name: "Pepperoni",
      aliases: [],
      sameAs: ["Chorizo", "Nduja Sausage"],
      fromDelivery: "12 days",
      inUse: "12 days",
    };
    const [repaired] = repairStoredRules([saved]);
    assert.equal(repaired?.fromDelivery, "12 days");
    assert.equal(repaired?.inUse, undefined);
  });

  it("keeps bacon delivery and in-use when both are on the chart", () => {
    const saved: ShelfRule = {
      id: "frozen:bacon-frozen",
      sectionId: "frozen",
      category: "Toppings",
      name: "Bacon (FROZEN)",
      aliases: [],
      sameAs: [],
      fromDelivery: "10 days",
      inUse: "7 days",
    };
    const [repaired] = repairStoredRules([saved]);
    assert.equal(repaired?.fromDelivery, "10 days");
    assert.equal(repaired?.inUse, "7 days");
  });

  it("drops chilled chorizo and nduja that are not on the chart", () => {
    const pepperoni: ShelfRule = {
      id: "chilled:pepperoni",
      sectionId: "chilled",
      category: "Toppings",
      name: "Pepperoni",
      aliases: [],
      sameAs: [],
      unopened: "Date on pack",
      prepped: "12 days",
    };
    const chorizo: ShelfRule = {
      id: "chilled:chorizo",
      sectionId: "chilled",
      category: "Toppings",
      name: "Chorizo",
      aliases: [],
      sameAs: [],
      unopened: "Date on pack",
      prepped: "12 days",
    };
    const repaired = repairStoredRules([pepperoni, chorizo]);
    assert.equal(
      repaired.some((item) => item.name === "Chorizo" && item.sectionId === "chilled"),
      false,
    );
    assert.equal(
      repaired.some((item) => item.name === "Pepperoni" && item.sectionId === "chilled"),
      true,
    );
  });
});
