import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULES } from "./chart";
import { addDaysToIso, addHoursToLocal } from "./dates";
import { calendarDaysToAdd, capAdvice, clocksFor, projectClock } from "./life";

const today = new Date(2026, 9, 23);

describe("shelf life dates", () => {
  it("counts the delivery date as day 1 of a from-delivery life", () => {
    const pepperoni = RULES.find(
      (rule) => rule.name === "Pepperoni" && rule.sectionId === "frozen",
    );
    assert.ok(pepperoni);
    const delivery = clocksFor(pepperoni).find((clock) => clock.id === "delivery");
    assert.ok(delivery);
    assert.equal(delivery.addDays, 12);
    assert.equal(delivery.inclusive, true);
    assert.equal(calendarDaysToAdd(delivery), 11);
    const result = projectClock(delivery, "2026-10-01", today);
    assert.equal(result?.when, "Mon 12 Oct 2026");
    assert.equal(addDaysToIso("2026-10-01", 11), "2026-10-12");
    const later = addHoursToLocal("2026-09-10T10:00", 48);
    assert.equal(later.getDate(), 12);
    assert.equal(later.getHours(), 10);
  });

  it("turns dough tray date into the next day", () => {
    const dough = RULES.find((rule) => rule.name === "Standard Dough (All sizes)");
    assert.ok(dough);
    const clocks = clocksFor(dough);
    assert.equal(clocks.length, 1);
    assert.equal(clocks[0]?.addDays, 1);
    assert.equal(clocks[0]?.inclusive, undefined);
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
    assert.equal(prepped.when, "Mon 12 Oct 2026 | 23:59");
    assert.match(capAdvice([pack, prepped]) ?? "", /12 Oct 2026/);
  });

  it("adds the 10-day life to the pineapple and olives prep date", () => {
    for (const name of ["Pineapple", "Olives"]) {
      const item = RULES.find((rule) => rule.name === name && rule.sectionId === "ready");
      assert.ok(item);
      const prepped = clocksFor(item).find((clock) => clock.id === "prepped");
      assert.ok(prepped);
      assert.equal(prepped.chilled, true);
      assert.equal(prepped.value, "10 days (Chilled)");
      assert.equal(prepped.addDays, 10);
      const result = projectClock(prepped, "2026-10-01", today);
      assert.equal(result?.when, "Sat 10 Oct 2026 | 23:59");
    }
  });

  it("marks ready-section prepped life chilled and keeps ambient use ambient", () => {
    const sauce = RULES.find((rule) => rule.name === "Pizza Sauce" && rule.sectionId === "ready");
    assert.ok(sauce);
    const clocks = clocksFor(sauce);
    const prepped = clocks.find((clock) => clock.id === "prepped");
    const ambient = clocks.find((clock) => clock.id === "ambient");
    assert.equal(prepped?.chilled, true);
    assert.equal(prepped?.value, "10 days (Chilled)");
    assert.equal(prepped?.inclusive, true);
    assert.equal(ambient?.chilled, false);
    assert.equal(ambient?.value, "15 hours");
    assert.equal(ambient?.addHours, 15);
    const prepResult = projectClock(prepped!, "2026-10-24", today);
    assert.equal(prepResult?.when, "Mon 2 Nov 2026 | 23:59");
    const ambientResult = projectClock(ambient!, "2026-10-24T14:30", today);
    assert.equal(ambientResult?.when, "Sun 25 Oct 2026 | 05:30");
  });

  it("keeps true ambient-section prepped life without a chilled state", () => {
    const sauce = RULES.find((rule) => rule.name === "Burger Sauce" && rule.sectionId === "ambient");
    assert.ok(sauce);
    const prepped = clocksFor(sauce).find((clock) => clock.id === "prepped");
    assert.equal(prepped?.chilled, false);
    assert.equal(prepped?.value, "14 days");
    assert.equal(prepped?.inclusive, true);
    const result = projectClock(prepped!, "2026-10-01", today);
    assert.equal(result?.when, "Wed 14 Oct 2026 | 23:59");
  });

  it("counts the prep date as day 1 of an in-use life", () => {
    const bacon = RULES.find((rule) => rule.name === "Bacon (FROZEN)");
    assert.ok(bacon);
    const inUse = clocksFor(bacon).find((clock) => clock.id === "use");
    assert.ok(inUse);
    assert.equal(inUse.addDays, 7);
    assert.equal(inUse.inclusive, true);
    const result = projectClock(inUse, "2026-10-01", today);
    assert.equal(result?.when, "Wed 7 Oct 2026 | 23:59");
  });

  it("adds prep and ambient hours to the time on the start date", () => {
    const mac = RULES.find((rule) => rule.name === "Mac n Cheese");
    assert.ok(mac);
    const prepHours = clocksFor(mac).find((clock) => clock.id === "use");
    assert.equal(prepHours?.addHours, 48);
    assert.equal(prepHours?.inclusive, undefined);
    const macResult = projectClock(prepHours!, "2026-10-01T10:00", today);
    assert.equal(macResult?.when, "Sat 3 Oct 2026 | 10:00");

    const bases = RULES.find((rule) => rule.name === "Prepared Double Decadence bases");
    assert.ok(bases);
    const clocks = clocksFor(bases);
    const chilled = clocks.find((clock) => clock.id === "prepped");
    const ambient = clocks.find((clock) => clock.id === "ambient");
    assert.equal(chilled?.addHours, 12);
    assert.equal(ambient?.addHours, 4);
    assert.equal(projectClock(chilled!, "2026-10-24T09:00", today)?.when, "Sat 24 Oct 2026 | 21:00");
    assert.equal(projectClock(ambient!, "2026-10-24T09:00", today)?.when, "Sat 24 Oct 2026 | 13:00");
  });

  it("counts an ambient day life through 23:59 on the last day", () => {
    const clocks = clocksFor({
      id: "ambient:sample",
      sectionId: "ready",
      category: "Sauces",
      name: "Sample",
      aliases: [],
      sameAs: [],
      prepped: "10 days",
      ambientUse: "2 days",
    });
    const ambient = clocks.find((clock) => clock.id === "ambient");
    assert.ok(ambient);
    assert.equal(ambient.inclusive, true);
    assert.equal(ambient.addDays, 2);
    const result = projectClock(ambient, "2026-10-01", today);
    assert.equal(result?.when, "Fri 2 Oct 2026 | 23:59");
  });

  it("adds sliced gherkins' 16-day life to the prep date", () => {
    const item = RULES.find((rule) => rule.name === "Sliced Gherkins");
    assert.ok(item);
    const clocks = clocksFor(item);
    assert.equal(
      clocks.some((clock) => clock.id === "ambient"),
      false,
      "ambient N/A must not show an ambient clock",
    );
    const prepped = clocks.find((clock) => clock.id === "prepped");
    assert.ok(prepped);
    assert.equal(prepped.chilled, true);
    assert.equal(prepped.value, "16 days (Chilled)");
    assert.equal(prepped.addDays, 16);
    const result = projectClock(prepped, "2026-10-24", today);
    assert.equal(result?.when, "Sun 8 Nov 2026 | 23:59");
  });

  it("adds pepperdew's 25-day life to the prep date", () => {
    const item = RULES.find((rule) => rule.name === "Pepperdew Piquante Peppers");
    assert.ok(item);
    const prepped = clocksFor(item).find((clock) => clock.id === "prepped");
    assert.ok(prepped);
    assert.equal(prepped.chilled, true);
    assert.equal(prepped.value, "25 days (Chilled)");
    assert.equal(prepped.addDays, 25);
    const result = projectClock(prepped, "2026-10-24", today);
    assert.equal(result?.when, "Tue 17 Nov 2026 | 23:59");
  });
});
