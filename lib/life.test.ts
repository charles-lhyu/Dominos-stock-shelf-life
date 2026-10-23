import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULES } from "./chart";
import { addDaysToIso, addHoursToLocal } from "./dates";
import { capAdvice, clocksFor, projectClock } from "./life";

const today = new Date(2026, 9, 23);

describe("shelf life dates", () => {
  it("adds the chart life to the date entered", () => {
    assert.equal(addDaysToIso("2026-10-01", 12), "2026-10-13");
    assert.equal(addDaysToIso("2026-10-23", 1), "2026-10-24");
    const later = addHoursToLocal("2026-10-23T10:00", 48);
    assert.equal(later.getDate(), 25);
    assert.equal(later.getHours(), 10);
  });

  it("turns dough tray date into the next day", () => {
    const dough = RULES.find((rule) => rule.name === "Standard Dough (All sizes)");
    assert.ok(dough);
    const clocks = clocksFor(dough);
    assert.equal(clocks.length, 1);
    assert.equal(clocks[0]?.addDays, 1);
    const result = projectClock(clocks[0], "2026-10-23", today);
    assert.equal(result?.when, "Sat 24 Oct 2026");
  });

  it("uses the pack date when it is sooner than the prepped life", () => {
    const pepperoni = RULES.find(
      (rule) => rule.name === "Pepperoni" && rule.sectionId === "chilled",
    );
    assert.ok(pepperoni);
    const clocks = clocksFor(pepperoni);
    const pack = projectClock(
      clocks.find((clock) => clock.cap)!,
      "2026-10-10",
      today,
    );
    const prepped = projectClock(
      clocks.find((clock) => clock.addDays === 12)!,
      "2026-10-01",
      today,
    );
    assert.ok(pack && prepped);
    assert.match(capAdvice([pack, prepped]) ?? "", /10 Oct 2026/);
  });

  it("keeps the prepped life when it ends before the pack date", () => {
    const pepperoni = RULES.find(
      (rule) => rule.name === "Pepperoni" && rule.sectionId === "chilled",
    );
    assert.ok(pepperoni);
    const clocks = clocksFor(pepperoni);
    const pack = projectClock(clocks.find((clock) => clock.cap)!, "2026-10-20", today);
    const prepped = projectClock(
      clocks.find((clock) => clock.addDays === 12)!,
      "2026-10-01",
      today,
    );
    assert.ok(pack && prepped);
    assert.match(capAdvice([pack, prepped]) ?? "", /13 Oct 2026/);
  });
});
