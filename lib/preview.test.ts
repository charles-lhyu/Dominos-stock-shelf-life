import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULES } from "./chart";
import { addHoursToLocal, formatDateTime } from "./dates";
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
    assert.equal(preview.when, "23:59 | Sun 8 Nov 2026");
  });

  it("keeps a delivery life when that date can be calculated", () => {
    const item = rule("Pepperoni");
    const frozen = RULES.find((entry) => entry.name === "Pepperoni" && entry.sectionId === "frozen");
    assert.ok(frozen);
    assert.equal(calculatedLifeKind(frozen), "stock");
    assert.deepEqual(lifeKindsForRule(frozen), ["stock", "prepped"]);
    const preview = datePreview(frozen, "2026-10-01", "stock", today);
    assert.equal(preview.when, "Mon 12 Oct 2026");
    // Spanned in-use cell: Prepped is its own 12-day clock from the prep date.
    const prepped = datePreview(frozen, "2026-10-01", "prepped", today);
    assert.equal(prepped.when, "23:59 | Mon 12 Oct 2026");
    assert.equal(item.name, "Pepperoni");
  });

  it("still shows Date on pack when Delivery is chosen", () => {
    const item = rule("Sliced Gherkins");
    const preview = datePreview(item, "2026-10-24", "stock", today);
    assert.equal(preview.when, "Date on pack");
  });

  it("counts prep and ambient dates from the delivery date", () => {
    const sauce = RULES.find((item) => item.name === "Pizza Sauce" && item.sectionId === "ready");
    assert.ok(sauce);
    const at = new Date(2026, 9, 24, 14, 30);
    const prepped = datePreview(sauce, "2026-10-24", "prepped", at, "14:30");
    const ambient = datePreview(sauce, "2026-10-24", "ambient", at, "14:30");
    assert.equal(prepped.when, "23:59 | Mon 2 Nov 2026");
    assert.equal(ambient.when, "05:30 | Sun 25 Oct 2026");
    assert.equal(ambient.asHours, true);

    const burger = RULES.find((item) => item.name === "Burger Sauce" && item.sectionId === "ambient");
    assert.ok(burger);
    const ambientPrep = datePreview(burger, "2026-10-01", "prepped", today);
    assert.equal(ambientPrep.when, "23:59 | Wed 14 Oct 2026");
  });

  it("starts an hour life at the locked prep time", () => {
    const item = rule("Garlic Butter");
    const at = new Date(2026, 9, 24, 14, 30);
    const preview = datePreview(item, "2026-10-24", "ambient", at, "14:30");
    assert.equal(preview.when, formatDateTime(addHoursToLocal("2026-10-24T14:30", 12)));
    assert.equal(preview.asHours, true);
  });

  it("keeps day lives on days in debug mode, not hours", () => {
    const item = rule("Pineapple");
    const preview = datePreview(item, "2026-10-24", "prepped", today);
    assert.equal(preview.asHours, false);
  });
});
