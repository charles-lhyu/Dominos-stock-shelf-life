import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalProductName,
  migrateProductDefaultEntries,
  migrateProductNames,
} from "./chart-name-migrate";

describe("chart product name migration", () => {
  it("maps Bacon (FROZEN) and NEW Chinese Style Chicken to clean titles", () => {
    assert.equal(canonicalProductName("Bacon (FROZEN)"), "Bacon");
    assert.equal(canonicalProductName("NEW Chinese Style Chicken"), "Chinese Style Chicken");
    assert.equal(canonicalProductName("Pepperoni"), "Pepperoni");
  });

  it("migrates hidden name lists", () => {
    assert.deepEqual(
      migrateProductNames(["Bacon (FROZEN)", "Olives", "NEW Chinese Style Chicken", "Bacon"]),
      ["Bacon", "Chinese Style Chicken", "Olives"],
    );
  });

  it("migrates storage defaults onto the clean title with frozen section", () => {
    const migrated = migrateProductDefaultEntries({
      "Bacon (FROZEN)": { section: "frozen" as const, life: null },
      Pepperoni: { section: "chilled" as const, life: null },
    });
    assert.deepEqual(migrated.Bacon, { section: "frozen", life: null });
    assert.deepEqual(migrated.Pepperoni, { section: "chilled", life: null });
    assert.equal(migrated["Bacon (FROZEN)"], undefined);
  });

  it("lets a Bacon (FROZEN) default set frozen when Bacon already had another section", () => {
    const migrated = migrateProductDefaultEntries({
      Bacon: { section: "chilled" as const, life: null },
      "Bacon (FROZEN)": { section: "frozen" as const, life: null },
    });
    assert.deepEqual(migrated.Bacon, { section: "frozen", life: null });
  });
});
