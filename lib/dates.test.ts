import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysBetween,
  excelSerialToIso,
  formatLongDate,
  parseExpiry,
  readExpiry,
} from "./dates";

const today = new Date(2026, 9, 23);

describe("parseExpiry", () => {
  it("reads UK day-first dates", () => {
    assert.equal(parseExpiry("23/10/2026"), "2026-10-23");
    assert.equal(parseExpiry("05/06/2026"), "2026-06-05");
    assert.equal(parseExpiry("23-10-26"), "2026-10-23");
    assert.equal(parseExpiry("5.6.2026"), "2026-06-05");
  });

  it("treats an impossible day as month-first", () => {
    assert.equal(parseExpiry("10/23/2026"), "2026-10-23");
  });

  it("reads ISO, named months, and compact numbers", () => {
    assert.equal(parseExpiry("2026-10-23"), "2026-10-23");
    assert.equal(parseExpiry("2026-10-23T00:00:00"), "2026-10-23");
    assert.equal(parseExpiry("23 Oct 2026"), "2026-10-23");
    assert.equal(parseExpiry("23rd October 2026"), "2026-10-23");
    assert.equal(parseExpiry("Oct 23, 2026"), "2026-10-23");
    assert.equal(parseExpiry(20261023), "2026-10-23");
  });

  it("reads Excel serials and Date objects", () => {
    assert.equal(excelSerialToIso(46318), "2026-10-23");
    assert.equal(parseExpiry(46318), "2026-10-23");
    assert.equal(parseExpiry(new Date(2026, 9, 23)), "2026-10-23");
  });

  it("rejects impossible dates and blanks", () => {
    assert.equal(parseExpiry("31/02/2026"), null);
    assert.equal(parseExpiry("29/02/2026"), null);
    assert.equal(parseExpiry("29/02/2028"), "2028-02-29");
    assert.equal(parseExpiry(""), null);
    assert.equal(parseExpiry("not a date"), null);
  });
});

describe("readExpiry", () => {
  it("describes how far a use-by date is from today", () => {
    assert.equal(readExpiry("2026-10-20", today).status, "expired");
    assert.equal(readExpiry("2026-10-20", today).detail, "3 days ago");
    assert.equal(readExpiry("2026-10-23", today).status, "today");
    assert.equal(readExpiry("2026-10-24", today).label, "Tomorrow");
    assert.equal(readExpiry("2026-10-25", today).status, "critical");
    assert.equal(readExpiry("2026-10-29", today).status, "soon");
    assert.equal(readExpiry("2026-11-04", today).status, "watch");
    assert.equal(readExpiry("2026-12-01", today).status, "ok");
    assert.equal(readExpiry(null, today).status, "missing");
    assert.equal(daysBetween(today, new Date(2026, 9, 23)), 0);
  });

  it("formats a date for the ticket", () => {
    assert.equal(formatLongDate("2026-10-23"), "Fri 23 Oct 2026");
  });
});
