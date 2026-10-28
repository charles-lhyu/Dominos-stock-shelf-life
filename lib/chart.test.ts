import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHART, RULES } from "./chart";
import { rulesForName, searchNames, shouldExpand } from "./search";

function rule(name: string, section: string) {
  const found = RULES.find((item) => item.name === name && item.sectionId === section);
  assert.ok(found, `${section} ${name}`);
  return found;
}

describe("Campaign 5 chart", () => {
  it("covers the printed rows", () => {
    assert.equal(RULES.length, 74);
    assert.equal(new Set(RULES.map((item) => item.id)).size, 74);
    assert.equal(CHART.validUntil, "2026-11-17");
    assert.equal(rule("Fries", "frozen").fromDelivery, "7 days");
    assert.equal(rule("Mac n Cheese", "frozen").category, "Sides");
    assert.equal(rule("Mac n Cheese", "frozen").fromDelivery, "6 days");
    assert.equal(rule("Cheese String - Garlic & Herb", "frozen").category, "Cheese");
    assert.equal(rule("Liquid Cheese", "chilled").category, "Sauces");
    assert.equal(rule("Standard Dough (All sizes)", "chilled").category, "Dough");
    assert.equal(rule("Prepared Double Decadence bases", "chilled").category, "Bases");
    assert.equal(rule("NEW Biscoff Crumb", "ambient").category, "Toppings");
    assert.equal(rule("Cornmeal", "ambient").category, "Other");
    assert.equal(rule("Franks Hot Sauce", "pack").category, "Other");
    assert.equal(rule("Coleslaw", "pack").category, "Other");
    assert.equal(rule("Ice Cream", "pack").category, "Other");
    assert.equal(rule("Butter Whirl", "pack").category, "Other");
    assert.equal(rule("Mac n Cheese", "frozen").inUse, "48 hours prepped");
    assert.equal(rule("Pepperoni", "frozen").fromDelivery, "12 days");
    assert.equal(rule("Pepperoni", "frozen").inUse, "12 days");
    assert.equal(rule("Pepperoni", "chilled").prepped, "12 days");
    assert.equal(rule("Chorizo", "frozen").fromDelivery, "12 days");
    assert.equal(rule("Chorizo", "frozen").inUse, "12 days");
    assert.equal(rule("Nduja Sausage", "frozen").fromDelivery, "12 days");
    assert.equal(rule("Nduja Sausage", "frozen").inUse, "12 days");
    assert.equal(
      RULES.some((item) => item.name === "Chorizo" && item.sectionId === "chilled"),
      false,
    );
    assert.equal(
      RULES.some((item) => item.name === "Nduja Sausage" && item.sectionId === "chilled"),
      false,
    );
    assert.equal(rule("Bacon (FROZEN)", "frozen").fromDelivery, "10 days");
    assert.equal(rule("Bacon (FROZEN)", "frozen").inUse, "7 days");
    assert.equal(rule("Chicken Wings", "frozen").fromDelivery, "9 days");
    assert.equal(rule("Chicken Wings", "frozen").inUse, "9 days");
    assert.equal(rule("Fries", "frozen").inUse, "7 days");
    assert.equal(rule("Mozzarella Cheese - Standard", "chilled").prepped, "9 days");
    assert.equal(rule("Plant-Based Cheese Alternative", "chilled").prepped, "7 days");
    assert.equal(rule("Ham", "chilled").prepped, "6 days");
    assert.equal(rule("Mushrooms", "chilled").prepped, "48 hours");
    assert.equal(rule("Garlic Butter", "chilled").prepped, "10 days");
    assert.equal(rule("Garlic Butter", "chilled").ambientUse, "12 hours");
    assert.equal(rule("Standard Dough (All sizes)", "chilled").prepped, "BB date on tray +1 day");
    assert.equal(rule("BBQ sauce", "ready").ambientUse, "15 hours");
    assert.equal(rule("Sundried Tomato and Garlic", "ready").ambientUse, "12 hours");
    assert.equal(rule("Cheese Sauce", "ready").prepped, "8 days");
    assert.equal(rule("Sliced Gherkins", "ready").prepped, "16 days");
    assert.equal(rule("Pepperdew Piquante Peppers", "ready").prepped, "25 days");
    assert.equal(rule("Pepperdew Piquante Peppers", "ready").note, undefined);
    assert.equal(rule("Pineapple", "ready").prepped, "10 days");
    assert.equal(rule("Olives", "ready").prepped, "10 days");
    assert.equal(rule("Burger Sauce", "ambient").prepped, "14 days");
    assert.equal(rule("Pesto Drizzle", "ambient").prepped, "21 days");
    assert.equal(rule("Habanero Hot Honey", "ambient").prepped, "35 days");
    assert.equal(rule("NEW Biscoff Crumb", "ambient").prepped, "30 days");
    assert.equal(rule("Cornmeal", "ambient").prepped, "BB date on pack");
  });

  it("finds a typed product and keeps both pepperoni rows", () => {
    const dough = searchNames("dough");
    assert.equal(shouldExpand(dough), true);
    assert.equal(dough[0]?.name, "Standard Dough (All sizes)");

    const pepperoni = rulesForName("Pepperoni");
    assert.deepEqual(
      pepperoni.map((item) => item.sectionId),
      ["frozen", "chilled"],
    );

    const chicken = searchNames("chicken");
    assert.equal(chicken[0]?.name, "Chicken");
    assert.equal(shouldExpand(chicken), true);
    assert.ok(chicken.some((hit) => hit.name === "Chicken Wings"));

    const sauces = searchNames("sauce");
    assert.equal(shouldExpand(sauces), false);
    assert.ok(sauces.length > 3);
  });
});
