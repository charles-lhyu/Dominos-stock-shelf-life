import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUNDLED_PACK } from "./chart-pack";
import { addDaysToIso, addHoursToLocal, formatDateTime, formatLongDate } from "./dates";
import { textConversionTable } from "./text-conversion";

const delivery = "2026-10-24";
const today = new Date(2026, 9, 24, 14, 30);

function rows() {
  return textConversionTable(BUNDLED_PACK, delivery, "14:30", today);
}

function findRow(name: string, text: string) {
  const row = rows().find((item) => item.name === name && item.text === text);
  assert.ok(row, `${name} / ${text}`);
  return row;
}

describe("text conversion table", () => {
  it("converts the confirmed prep lives from 24 Oct 2026", () => {
    assert.equal(findRow("Sliced Gherkins", "16 days").useBy, "Mon 9 Nov 2026 | 23:59");
    assert.equal(findRow("Pepperdew Piquante Peppers", "25 days").useBy, "Wed 18 Nov 2026 | 23:59");
    assert.equal(findRow("Pineapple", "10 days").useBy, "Tue 3 Nov 2026 | 23:59");
    assert.equal(findRow("Olives", "10 days").useBy, "Tue 3 Nov 2026 | 23:59");
  });

  it("leaves printed pack dates off the prep calendar", () => {
    const printed = rows().filter((row) => row.text === "Date on pack");
    assert.ok(printed.length > 0);
    for (const row of printed) {
      assert.equal(row.useBy, "On the pack");
    }
  });

  it("adds every plain day count in full", () => {
    for (const row of rows()) {
      const match = row.text.match(/^(\d+)\s*days$/);
      if (!match) continue;
      const expected = formatLongDate(addDaysToIso(delivery, Number(match[1])));
      assert.ok(
        row.useBy.startsWith(expected),
        `${row.name} ${row.text} → ${row.useBy}, expected ${expected}`,
      );
    }
  });

  it("uses the tray date plus one day for dough", () => {
    assert.equal(findRow("Standard Dough (All sizes)", "BB date on tray +1 day").useBy, "Sun 25 Oct 2026");
  });

  it("starts hour clocks at the prep time", () => {
    const garlic = findRow("Garlic Butter", "12 hours");
    assert.equal(garlic.useBy, formatDateTime(addHoursToLocal("2026-10-24T14:30", 12)));
  });

  it("shows the imported pack life as-is", () => {
    const pack = {
      ...BUNDLED_PACK,
      rules: BUNDLED_PACK.rules.map((rule) =>
        rule.name === "Pineapple" && rule.sectionId === "ready"
          ? { ...rule, prepped: "25 days" }
          : rule,
      ),
    };
    const row = textConversionTable(pack, delivery, "", today).find(
      (item) => item.name === "Pineapple" && item.field === "Prepped",
    );
    assert.equal(row?.text, "25 days");
    assert.equal(row?.useBy, "Wed 18 Nov 2026 | 23:59");
  });
});
