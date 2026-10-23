import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSampleBook } from "./sample";
import {
  groupHits,
  hasExactCode,
  lineMatchesFilter,
  searchLines,
} from "./search";

const today = new Date(2026, 9, 23);
const book = buildSampleBook(today);

describe("searchLines", () => {
  it("matches a typed code, a scanned barcode, and a name", () => {
    const byCode = searchLines(book.lines, "dough14");
    assert.equal(new Set(byCode.map((line) => line.code)).size, 1);
    assert.equal(byCode[0]?.code, "DOUGH14");
    assert.equal(byCode[0]?.batch, "DB-441");

    const byScan = searchLines(book.lines, "5010000000325");
    assert.ok(byScan.every((line) => line.code === "CHICK"));
    assert.equal(hasExactCode(book.lines, "]E05010000000325"), true);

    const byName = groupHits(searchLines(book.lines, "chicken"));
    assert.deepEqual(
      byName.map((group) => group.code),
      ["WINGS", "CHICK"],
    );
  });

  it("filters the board by how soon the stock expires", () => {
    const expired = book.lines.filter((line) =>
      lineMatchesFilter(line, "expired", today),
    );
    assert.ok(expired.some((line) => line.batch === "CK-017"));
    assert.ok(expired.every((line) => line.batch !== "MZ-901"));

    const week = book.lines.filter((line) =>
      lineMatchesFilter(line, "week", today),
    );
    assert.ok(week.some((line) => line.code === "MOZZ" && line.batch === "MZ-901"));
    assert.ok(week.every((line) => line.batch !== "CK-017"));
  });
});
