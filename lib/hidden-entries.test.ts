import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addHiddenEntry,
  formatHiddenLabel,
  isProductHidden,
  isSectionHidden,
  parseHiddenEntries,
  removeHiddenEntry,
  serializeHiddenEntries,
} from "./hidden-entries";

describe("hidden entries", () => {
  it("keeps a plain name as hide-all", () => {
    assert.deepEqual(parseHiddenEntries(["Olives", "Bacon"]), [
      { name: "Bacon", section: null },
      { name: "Olives", section: null },
    ]);
  });

  it("maps Bacon (FROZEN) to Bacon frozen storage", () => {
    assert.deepEqual(parseHiddenEntries(["Bacon (FROZEN)", "Olives"]), [
      { name: "Bacon", section: "frozen" },
      { name: "Olives", section: null },
    ]);
  });

  it("reads object entries and collapses section hides under hide-all", () => {
    assert.deepEqual(
      parseHiddenEntries([
        { name: "Bacon", section: "frozen" },
        { name: "Bacon", section: "chilled" },
        { name: "Bacon" },
      ]),
      [{ name: "Bacon", section: null }],
    );
  });

  it("checks one storage against hide-all and section hides", () => {
    const entries = parseHiddenEntries([
      { name: "Bacon", section: "frozen" },
      "Olives",
    ]);
    assert.equal(isSectionHidden(entries, "Bacon", "frozen"), true);
    assert.equal(isSectionHidden(entries, "Bacon", "chilled"), false);
    assert.equal(isSectionHidden(entries, "Olives", "ambient"), true);
    assert.equal(isProductHidden(entries, "Bacon", ["frozen", "chilled"]), false);
    assert.equal(isProductHidden(entries, "Olives", ["ambient"]), true);
  });

  it("adds and removes section hides", () => {
    let entries = addHiddenEntry([], "Bacon", "frozen");
    entries = addHiddenEntry(entries, "Bacon", "chilled");
    assert.deepEqual(entries, [
      { name: "Bacon", section: "chilled" },
      { name: "Bacon", section: "frozen" },
    ]);
    entries = removeHiddenEntry(entries, "Bacon", "frozen");
    assert.deepEqual(entries, [{ name: "Bacon", section: "chilled" }]);
    entries = addHiddenEntry(entries, "Bacon", null);
    assert.deepEqual(entries, [{ name: "Bacon", section: null }]);
  });

  it("serializes hide-all as a plain name", () => {
    assert.deepEqual(
      serializeHiddenEntries([
        { name: "Bacon", section: "frozen" },
        { name: "Olives", section: null },
      ]),
      [{ name: "Bacon", section: "frozen" }, "Olives"],
    );
  });

  it("labels a section hide for Settings", () => {
    assert.equal(formatHiddenLabel({ name: "Bacon", section: "frozen" }), "Bacon · Frozen");
    assert.equal(formatHiddenLabel({ name: "Olives", section: null }), "Olives");
  });
});
