import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULES } from "./chart";
import { calculatedLifeKind, datePreview, lifeKindsForRule, pickLifeKind } from "./preview";

const today = new Date(2026, 9, 24);

function rule(name: string) {
  const found = RULES.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

describe("list use-by dates", () => {
  it("shows sliced gherkins' 16-day prep use-by instead of Date on pack", () => {
    const item = rule("Sliced Gherkins");
    const kind = pickLifeKind(lifeKindsForRule(item), calculatedLifeKind(item));
    const preview = datePreview(item, "2026-10-24", kind, today);
    assert.equal(kind, "prepped");
    assert.equal(preview.when, "Mon 9 Nov 2026 | 23:59");
  });

  it("keeps a delivery life when that date can be calculated", () => {
    const item = rule("Pepperoni");
    const frozen = RULES.find((entry) => entry.name === "Pepperoni" && entry.sectionId === "frozen");
    assert.ok(frozen);
    assert.equal(calculatedLifeKind(frozen), "stock");
    const preview = datePreview(frozen, "2026-10-01", "stock", today);
    assert.equal(preview.when, "Tue 13 Oct 2026");
    assert.equal(item.name, "Pepperoni");
  });

  it("still shows Date on pack when Delivery is chosen", () => {
    const item = rule("Sliced Gherkins");
    const preview = datePreview(item, "2026-10-24", "stock", today);
    assert.equal(preview.when, "Date on pack");
  });
});
