import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLines, detectMapping, mappingProblem } from "./columns";
import type { SheetTable } from "./types";

const table: SheetTable = {
  sheetName: "Stock",
  headers: [
    "Item code",
    "Barcode",
    "Item name",
    "Use by",
    "Qty",
    "Unit",
    "Location",
    "Batch",
    "Updated",
    "Category",
  ],
  rows: [
    ["MOZZ", "5010000000201", "Mozzarella blend", "23/10/2026", 6, "bags", "Cheese fridge", "MZ-901", "22/10/2026", "Cheese"],
    ["CHICK", "5010000000325", "Grilled chicken strips", "not-a-date", 4, "bags", "Meat chiller", "CK-017", "", "Meat"],
    ["", "", "", "", "", "", "", "", "", ""],
    ["", "5010000000401", "Signature pizza sauce", new Date(2026, 10, 18), 9, "bags", "Sauce rail", "TS-100", "", "Sauce"],
  ],
};

describe("detectMapping", () => {
  it("maps a makeline sheet and ignores the updated column", () => {
    const mapping = detectMapping(table.headers);
    assert.equal(mapping.code, 0);
    assert.equal(mapping.altCode, 1);
    assert.equal(mapping.name, 2);
    assert.equal(mapping.expiry, 3);
    assert.equal(mapping.quantity, 4);
    assert.equal(mapping.unit, 5);
    assert.equal(mapping.location, 6);
    assert.equal(mapping.batch, 7);
    assert.equal(mapping.category, 9);
    assert.equal(mappingProblem(mapping), null);
  });

  it("asks for a code and a date when those columns are missing", () => {
    const mapping = detectMapping(["Notes", "Updated"]);
    assert.ok(mappingProblem(mapping));
  });
});

describe("buildLines", () => {
  it("keeps readable dates and counts bad ones", () => {
    const result = buildLines(table, detectMapping(table.headers));
    assert.equal(result.lines.length, 3);
    assert.equal(result.skippedRows, 1);
    assert.equal(result.unreadableDates, 1);
    assert.equal(result.lines[0]?.expiry, "2026-10-23");
    assert.equal(result.lines[0]?.altCode, "5010000000201");
    assert.equal(result.lines[1]?.expiry, null);
    assert.equal(result.lines[1]?.expiryRaw, "not-a-date");
    assert.equal(result.lines[2]?.code, "5010000000401");
    assert.equal(result.lines[2]?.expiry, "2026-11-18");
  });
});
