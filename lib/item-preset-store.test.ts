import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retainProductDefaults, type ProductDefault } from "./item-preset-store";
import type { ShelfRule } from "./types";

function rule(name: string, sectionId: ShelfRule["sectionId"]): ShelfRule {
  return {
    id: `${name}-${sectionId}`,
    sectionId,
    category: "Toppings",
    name,
    aliases: [],
    sameAs: [],
  };
}

const pepperoni: ProductDefault = { section: "chilled", life: "stock" };
const dough: ProductDefault = { section: "frozen", life: "stock" };

describe("product defaults worth storing", () => {
  const rules = [rule("Pepperoni", "frozen"), rule("Pepperoni", "chilled"), rule("Dough", "frozen")];

  it("keeps a product that has more than one storage option", () => {
    const kept = retainProductDefaults({ Pepperoni: pepperoni, Dough: dough }, rules, []);
    assert.deepEqual(kept.Pepperoni, pepperoni);
    assert.equal(kept.Dough, undefined);
  });

  it("drops a hidden product even when it has several storage options", () => {
    const kept = retainProductDefaults({ Pepperoni: pepperoni }, rules, ["Pepperoni"]);
    assert.deepEqual(kept, {});
  });
});
