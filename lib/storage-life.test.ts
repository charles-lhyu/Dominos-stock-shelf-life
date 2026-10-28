import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clocksFor } from "./life";
import { packFromPdfText } from "./pdf-chart";
import {
  livesFromChilledAmbientWording,
  splitPreppedAmbientFields,
} from "./storage-life";
import type { ShelfRule } from "./types";

const HEADER =
  "Campaign 5 shelf life chart. All stores. Version 1. Issued on 7 September 2026. Valid until 17 November 2026. ";

describe("chilled / ambient prepped cells", () => {
  it("reads chilled and ambient wording from divided cells", () => {
    assert.deepEqual(
      livesFromChilledAmbientWording("12 hours chilled 4 hours ambient"),
      { chilled: "12 hours chilled", ambient: "4 hours" },
    );
    assert.deepEqual(livesFromChilledAmbientWording("chilled: 12 hours"), {
      chilled: "12 hours chilled",
      ambient: undefined,
    });
  });

  it("splits a joined prepped string into prepped chilled and ambient", () => {
    assert.deepEqual(
      splitPreppedAmbientFields("12 hours chilled 4 hours ambient", undefined),
      { prepped: "12 hours chilled", ambientUse: "4 hours" },
    );
  });

  it("keeps an unlabeled companion hour as ambient when chilled is named", () => {
    assert.deepEqual(
      splitPreppedAmbientFields("12 hours chilled", "4 hours", "12 hours chilled 4 hours"),
      { prepped: "12 hours chilled", ambientUse: "4 hours" },
    );
  });

  it("leaves plain day + hour rows without storage wording alone", () => {
    assert.deepEqual(splitPreppedAmbientFields("10 days", "12 hours"), {
      prepped: "10 days",
      ambientUse: "12 hours",
    });
  });

  it("marks the prepped clock chilled and the ambient clock ambient", () => {
    const rule: ShelfRule = {
      id: "chilled:prepared-double-decadence-bases",
      sectionId: "chilled",
      category: "Bases",
      name: "Prepared Double Decadence bases",
      aliases: [],
      sameAs: [],
      prepped: "12 hours chilled 4 hours ambient",
    };
    const clocks = clocksFor(rule);
    const prepped = clocks.find((clock) => clock.id === "prepped");
    const ambient = clocks.find((clock) => clock.id === "ambient");
    assert.equal(prepped?.value, "12 hours (Chilled)");
    assert.equal(prepped?.chilled, true);
    assert.equal(prepped?.addHours, 12);
    assert.equal(ambient?.value, "4 hours");
    assert.equal(ambient?.chilled, false);
    assert.equal(ambient?.addHours, 4);
  });

  it("parses divided chilled/ambient cells from PDF text", () => {
    const text =
      "Prepared Double Decadence bases N/A 12 hours chilled 4 hours ambient Standard Dough";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const rule = result.pack.rules.find(
      (item) => item.name === "Prepared Double Decadence bases",
    );
    assert.ok(rule);
    assert.equal(rule.prepped, "12 hours chilled");
    assert.equal(rule.ambientUse, "4 hours");
  });

  it("reclaims ambient hours printed after the next product name", () => {
    const text =
      "Prepared Double Decadence bases N/A 12 hours chilled Pineapple 6 hours ambient Date on pack 10 days";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const decadence = result.pack.rules.find(
      (item) => item.name === "Prepared Double Decadence bases",
    );
    const pineapple = result.pack.rules.find((item) => item.name === "Pineapple");
    assert.ok(decadence);
    assert.equal(decadence.prepped, "12 hours chilled");
    assert.equal(decadence.ambientUse, "6 hours");
    assert.ok(pineapple);
    assert.equal(pineapple.ambientUse, "N/A");
  });
});
