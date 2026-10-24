import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { packFromPdfText } from "./pdf-chart";

const HEADER =
  "Campaign 5 shelf life chart. All stores. Version 1. Issued on 7 September 2026. Valid until 17 November 2026. ";

function prepped(text: string, name: string) {
  const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
  assert.equal(result.ok, true);
  if (!result.ok) return "";
  const rule = result.pack.rules.find((item) => item.name === name);
  assert.ok(rule, name);
  return rule.prepped;
}

describe("PDF shelf life parsing", () => {
  it("does not give pineapple and olives the previous row's 25 days", () => {
    const shared =
      "Pepperdew Piquante Peppers 25 days Pineapple Olives 10 days Tuna 6 days";
    assert.equal(prepped(shared, "Pepperdew Piquante Peppers"), "25 days");
    assert.equal(prepped(shared, "Pineapple"), "10 days");
    assert.equal(prepped(shared, "Olives"), "10 days");
    assert.equal(prepped(shared, "Tuna"), "6 days");

    const rows =
      "Pepperdew Piquante Peppers Date on pack 25 days N/A Pineapple Date on pack 10 days N/A Olives Date on pack 10 days N/A Tuna Date on pack 6 days N/A";
    assert.equal(prepped(rows, "Pineapple"), "10 days");
    assert.equal(prepped(rows, "Olives"), "10 days");
    assert.equal(prepped(rows, "Pepperdew Piquante Peppers"), "25 days");
  });

  it("keeps a life that is printed before the name from overwriting the row", () => {
    const text = "25 days Pineapple Olives 10 days";
    assert.equal(prepped(text, "Pineapple"), "10 days");
    assert.equal(prepped(text, "Olives"), "10 days");
  });

  it("assigns a life column one count per name instead of the first count", () => {
    const columns =
      "Pepperdew Piquante Peppers Pineapple Olives 25 days 10 days 10 days";
    assert.equal(prepped(columns, "Pepperdew Piquante Peppers"), "25 days");
    assert.equal(prepped(columns, "Pineapple"), "10 days");
    assert.equal(prepped(columns, "Olives"), "10 days");
  });

  it("still shares one life when names are joined with a slash or and", () => {
    assert.equal(prepped("Pineapple / Olives 9 days", "Pineapple"), "9 days");
    assert.equal(prepped("Pineapple / Olives 9 days", "Olives"), "9 days");
    assert.equal(prepped("Pineapple and Olives 9 days", "Pineapple"), "9 days");
    assert.equal(prepped("Pineapple and Olives 9 days", "Olives"), "9 days");
  });
});
