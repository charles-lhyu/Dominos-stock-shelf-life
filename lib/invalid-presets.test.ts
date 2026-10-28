import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chartProductDefaults,
  listInvalidProductDefaults,
} from "./invalid-presets";
import type { ProductDefault } from "./item-preset-store";
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

const baconRules = [
  rule("Bacon", "frozen"),
  rule("Bacon", "chilled"),
  rule("Pepperoni", "frozen"),
  rule("Pepperoni", "chilled"),
  rule("Dough", "frozen"),
];

describe("invalid product defaults", () => {
  it("flags Bacon (FROZEN) as renamed with an update to Bacon frozen", () => {
    const invalid = listInvalidProductDefaults(
      {
        "Bacon (FROZEN)": { section: "frozen", life: null },
        Pepperoni: { section: "chilled", life: null },
      },
      baconRules,
    );
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0]?.name, "Bacon (FROZEN)");
    assert.equal(invalid[0]?.reason, "renamed");
    assert.deepEqual(invalid[0]?.update, { name: "Bacon", section: "frozen" });
  });

  it("flags a product that is not on the chart", () => {
    const invalid = listInvalidProductDefaults(
      { "Mystery Topping": { section: "chilled", life: null } },
      baconRules,
    );
    assert.equal(invalid[0]?.reason, "unknown");
    assert.equal(invalid[0]?.update, undefined);
  });

  it("flags a storage the chart no longer has for that product", () => {
    const invalid = listInvalidProductDefaults(
      { Dough: { section: "chilled", life: null } },
      baconRules,
    );
    assert.equal(invalid[0]?.reason, "wrong-storage");
    assert.deepEqual(invalid[0]?.update, { name: "Dough", section: "frozen" });
  });

  it("flags a single-storage default as not needed", () => {
    const invalid = listInvalidProductDefaults(
      { Dough: { section: "frozen", life: null } },
      baconRules,
    );
    assert.equal(invalid[0]?.reason, "not-needed");
  });

  it("applies renames when building chart defaults for the list", () => {
    const defaults: Record<string, ProductDefault> = {
      "Bacon (FROZEN)": { section: "frozen", life: null },
      "Mystery Topping": { section: "chilled", life: null },
      Dough: { section: "frozen", life: null },
    };
    assert.deepEqual(chartProductDefaults(defaults, baconRules), {
      Bacon: { section: "frozen", life: null },
    });
  });
});
