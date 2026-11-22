import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { packFromPdfText, scrapeCampaignDates } from "./pdf-chart";
import type { ShelfRule } from "./types";

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
      "Pepperdew Piquante Peppers Date on pack 25 days N/A Pineapple and Olives Date on pack 10 days N/A Tuna Date on pack 6 days N/A";
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
    const text = "25 days Pineapple and Olives Date on pack 10 days N/A";
    assert.equal(prepped(text, "Pineapple"), "10 days");
    assert.equal(prepped(text, "Olives"), "10 days");
  });

  it("only keeps products that have a shelf-life cell on the PDF, not footnote mentions", () => {
    const text =
      "Pepperoni 14 days Chorizo 14 days Notes: see Chinese Style Chicken Bacon Ham Pineapple Olives for older charts.";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-6.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const names = result.pack.rules.map((item) => item.name).sort();
    assert.deepEqual(names, ["Chorizo", "Pepperoni"]);
    const pepperoni = result.pack.rules.find((item) => item.name === "Pepperoni");
    assert.equal(pepperoni?.fromDelivery, "14 days");
  });

  it("drops bare name mentions that have no life cell", () => {
    const text = "Pepperoni Chorizo listed on the makeline board.";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /No shelf-life products/i);
  });

  it("still drops footnote-only catalog mentions after Notes:", () => {
    const text =
      "Pepperoni 14 days Notes: see Chorizo Bacon Ham for older charts.";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const names = result.pack.rules.map((item) => item.name).sort();
    assert.deepEqual(names, ["Pepperoni"]);
  });

  it("does not invent product names from footnote hour / packaging sentences", () => {
    const text =
      "Pepperoni 14 days. Stock the top of the make-line with no more than 2 hours of product. " +
      "Opened prepped dates must not go past the use-by date on the original packaging Date on pack.";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const names = result.pack.rules.map((item) => item.name);
    assert.deepEqual(names, ["Pepperoni"]);
    assert.ok(!names.some((name) => /more than|make|packaging|opened/i.test(name)));
  });

  it("does not chop a longer new title down to a short catalog tail like Chicken", () => {
    const text =
      "Campaign 6 Shelf Life All stores Version 1 Issued on Valid to 16th November 2026 4th January 2027. " +
      "Chilled (defrosted / frozen before use) NEW Spicy Honey Glazed Chicken 11 days Pepperoni 14 days";
    const result = packFromPdfText(text, "campaign-6.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const names = result.pack.rules.map((item) => item.name).sort();
    assert.ok(names.includes("Pepperoni"));
    assert.ok(names.includes("Spicy Honey Glazed Chicken"));
    assert.ok(!names.includes("Chicken"));
    const spicy = result.pack.rules.find(
      (item) => item.name === "Spicy Honey Glazed Chicken",
    );
    assert.equal(spicy?.fromDelivery, "11 days");
    assert.deepEqual(spicy?.tags, ["new"]);
  });

  it("reads Campaign 6 table rows with vertically merged life cells", () => {
    const text = [
      "CAMPAIGN 6 SHELF LIFE CHART",
      "ALL STORES",
      "Version 1 - Campaign Dates, 16th November 2026 to 4th January 2027",
      "Issued: 4th November 2026",
      "CHILLED (DEFROSTED / FROZEN BEFORE USE)",
      "Pepperoni",
      "Chorizo 12 days",
      "Nduja Sausage",
      "Tandoori Chicken 10 days",
      "Bacon (FROZEN) 10 days 7 days You will be notified by Supply Chain if you are due to receive Frozen Bacon",
      "Toppings NEW Sage and Onion Turkey 7 days",
      "NEW BBQ Pulled Pork 10 days",
      "Beef",
      "Chicken 9 days",
      "Hot Dog Slices",
      "Meatballs",
      "Sausage 6 days",
      "Sides Chicken Wings 9 days Chicken Wings Prepped Life - Remaining life of Wings",
      "Potato Wedges 7 days",
      "Bacon Date on pack 6 days",
      "Ham",
      "Toppings Green Chillies",
      "Mushrooms",
      "Onions Date on pack 48 hours",
      "Peppers",
      "Sauces NEW Cranberry Drizzle Date on pack 35 days Keep ambient",
      "OTHER ITEMS - THE FOLLOWING ITEMS LISTED BELOW ARE DATED ON THE ORIGINAL PACKAGING",
      "Franks Hot Sauce, Butter Whirl, Coleslaw, Salt Sachets",
      "Always follow the shelf life and storage information as provided by DPG",
      "# Classification: Internal Make sure the top of the make-line is stocked with no more than 2 hours worth of product",
    ].join("\n");
    const result = packFromPdfText(text, "campaign-6.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pack.chart.issued, "2026-11-04");
    assert.equal(result.pack.chart.validUntil, "2027-01-04");
    const frozen = (name: string) =>
      result.pack.rules.find((item) => item.name === name && item.sectionId === "frozen");
    assert.equal(frozen("Pepperoni")?.fromDelivery, "12 days");
    assert.equal(frozen("Nduja Sausage")?.fromDelivery, "12 days");
    assert.equal(frozen("Beef")?.fromDelivery, "9 days");
    assert.equal(frozen("Sausage")?.fromDelivery, "6 days");
    assert.equal(frozen("Chicken Wings")?.fromDelivery, "9 days");
    assert.equal(frozen("Potato Wedges")?.fromDelivery, "7 days");
    const turkey = frozen("Sage and Onion Turkey");
    assert.ok(turkey);
    assert.equal(turkey.fromDelivery, "7 days");
    assert.deepEqual(turkey.tags, ["new"]);
    const pulledPork = frozen("BBQ Pulled Pork");
    assert.ok(pulledPork);
    assert.equal(pulledPork.category, "Toppings");
    assert.deepEqual(pulledPork.tags, ["new"]);
    assert.equal(turkey.category, "Toppings");
    const ham = result.pack.rules.find(
      (item) => item.name === "Ham" && item.sectionId === "chilled",
    );
    assert.equal(ham?.prepped, "6 days");
    const chillies = result.pack.rules.find(
      (item) => item.name === "Green Chillies" && item.sectionId === "chilled",
    );
    assert.equal(chillies?.prepped, "48 hours");
    assert.ok(
      result.pack.rules.some(
        (item) => item.name === "Franks Hot Sauce" && item.sectionId === "pack",
      ),
    );
    assert.ok(
      !result.pack.rules.some((item) =>
        /additional info|make-line|no more than|^onion turkey$/i.test(item.name),
      ),
    );
  });

  it("discovers brand-new PDF products that are not in the bundled catalog", () => {
    const text =
      "Campaign 6 Shelf Life All stores Version 1 Issued on Valid to 16th November 2026 4th January 2027. " +
      "Chilled (defrosted / frozen before use) Pepperoni 14 days NEW Spicy Honey Sauce 11 days " +
      "Chilled — ambient before use Galaxy Veg Date on pack 10 days N/A " +
      "Notes: Chinese Style Chicken see previous chart.";
    const result = packFromPdfText(text, "campaign-6.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const names = result.pack.rules.map((item) => item.name).sort();
    assert.ok(names.includes("Pepperoni"));
    assert.ok(names.includes("Spicy Honey Sauce"));
    assert.ok(names.includes("Galaxy Veg"));
    assert.ok(!names.includes("Chinese Style Chicken"));
    const spicy = result.pack.rules.find((item) => item.name === "Spicy Honey Sauce");
    assert.deepEqual(spicy?.tags, ["new"]);
    assert.equal(spicy?.fromDelivery, "11 days");
    assert.equal(spicy?.category, "Sauces");
    assert.notEqual(spicy?.category, "Imported");
    const veg = result.pack.rules.find((item) => item.name === "Galaxy Veg");
    assert.equal(veg?.unopened, "Date on pack");
    assert.equal(veg?.prepped, "10 days");
    assert.equal(veg?.category, "Toppings");
    assert.ok(!result.pack.rules.some((item) => item.category === "Imported"));
  });

  it("does not give sliced gherkins the previous sauce's 8 days", () => {
    const text =
      "Cheese Sauce Date on pack 8 days 15 hours Sliced Gherkins Date on pack 16 days N/A Sweetcorn Date on pack 11 days N/A";
    assert.equal(prepped(text, "Cheese Sauce"), "8 days");
    assert.equal(prepped(text, "Sliced Gherkins"), "16 days");
    assert.equal(prepped(text, "Sweetcorn"), "11 days");
  });

  it("stores the cropped PDF row used for each matched product", () => {
    const text =
      "Pepperdew Piquante Peppers Date on pack 25 days N/A Pineapple Date on pack 10 days N/A";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const pepperdew = result.pack.rules.find((item) => item.name === "Pepperdew Piquante Peppers");
    const pineapple = result.pack.rules.find((item) => item.name === "Pineapple");
    assert.ok(pepperdew?.pdfCrop);
    assert.match(pepperdew.pdfCrop, /pepperdew/i);
    assert.match(pepperdew.pdfCrop, /25\s*days/i);
    assert.ok(pineapple?.pdfCrop);
    assert.match(pineapple.pdfCrop, /pineapple/i);
    assert.match(pineapple.pdfCrop, /10\s*days/i);
  });

  it("keeps Bacon delivery at 10 days when only the 7-day in-use count follows the chart label", () => {
    const text =
      "Bacon (FROZEN) 7 days You will be notified by Supply Chain NEW Chinese Style Chicken 9 days";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const bacon = result.pack.rules.find(
      (item) => item.name === "Bacon" && item.sectionId === "frozen",
    );
    assert.ok(bacon);
    assert.equal(bacon.fromDelivery, "10 days");
    assert.equal(bacon.inUse, "7 days");
    const chinese = result.pack.rules.find(
      (item) => item.name === "Chinese Style Chicken" && item.sectionId === "frozen",
    );
    assert.ok(chinese);
    assert.equal(chinese.fromDelivery, "9 days");
    assert.equal(chinese.inUse, "9 days");
    assert.deepEqual(chinese.tags, ["new"]);
  });

  it("treats Bacon (FROZEN) as Bacon frozen storage, not a separate product title", () => {
    const text =
      "Bacon (FROZEN) 10 days 7 days Bacon Date on pack 6 days N/A";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const frozen = result.pack.rules.find(
      (item) => item.name === "Bacon" && item.sectionId === "frozen",
    );
    const chilled = result.pack.rules.find(
      (item) => item.name === "Bacon" && item.sectionId === "chilled",
    );
    assert.ok(frozen);
    assert.equal(frozen.fromDelivery, "10 days");
    assert.equal(frozen.inUse, "7 days");
    assert.ok(chilled);
    assert.equal(chilled.prepped, "6 days");
  });

  it("copies a spanned from-delivery / in-use day count onto both lives", () => {
    const text = "Pepperoni / Chorizo / Nduja Sausage 11 days Tandoori Chicken 10 days";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const name of ["Pepperoni", "Chorizo", "Nduja Sausage"]) {
      const rule: ShelfRule | undefined = result.pack.rules.find(
        (item) => item.name === name && item.sectionId === "frozen",
      );
      assert.ok(rule, name);
      assert.equal(rule.fromDelivery, "11 days");
      assert.equal(rule.inUse, "11 days");
    }
    const tandoori = result.pack.rules.find(
      (item) => item.name === "Tandoori Chicken" && item.sectionId === "frozen",
    );
    assert.ok(tandoori);
    assert.equal(tandoori.fromDelivery, "10 days");
    assert.equal(tandoori.inUse, "10 days");
  });

  it("assigns a life column one count per name instead of the first count", () => {
    const columns =
      "Pepperdew Piquante Peppers Pineapple Olives 25 days 10 days 10 days";
    assert.equal(prepped(columns, "Pepperdew Piquante Peppers"), "25 days");
    assert.equal(prepped(columns, "Pineapple"), "10 days");
    assert.equal(prepped(columns, "Olives"), "10 days");
  });

  it("keeps frozen name-column rows when Bacon prints two day counts", () => {
    const text =
      "Pepperoni Chorizo Nduja Sausage Bacon Tandoori Chicken Chinese Style Chicken " +
      "12 days 12 days 12 days 10 days 7 days 10 days 9 days";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const frozen = (name: string) =>
      result.pack.rules.find(
        (item) => item.name === name && item.sectionId === "frozen",
      );
    for (const name of ["Pepperoni", "Chorizo", "Nduja Sausage"]) {
      const rule = frozen(name);
      assert.ok(rule, name);
      assert.equal(rule.fromDelivery, "12 days");
      assert.equal(rule.inUse, "12 days");
    }
    const bacon = frozen("Bacon");
    assert.ok(bacon);
    assert.equal(bacon.fromDelivery, "10 days");
    assert.equal(bacon.inUse, "7 days");
    const tandoori = frozen("Tandoori Chicken");
    assert.ok(tandoori);
    assert.equal(tandoori.fromDelivery, "10 days");
    const chinese = frozen("Chinese Style Chicken");
    assert.ok(chinese);
    assert.equal(chinese.fromDelivery, "9 days");
    assert.ok(
      !result.pack.rules.some((item) =>
        /pepperoni.*chorizo|bacon.*tandoori/i.test(item.name),
      ),
      "must not invent a concatenated frozen mega-name",
    );
  });

  it("does not invent a mega-name from a chilled name+life column", () => {
    const text =
      "Pepperdew Piquante Peppers Pineapple Olives 25 days 10 days 10 days";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const names = result.pack.rules.map((item) => item.name).sort();
    assert.deepEqual(names, ["Olives", "Pepperdew Piquante Peppers", "Pineapple"]);
  });

  it("shares one life across a name column when the cell is spanned without slashes", () => {
    const text = "Pepperoni Chorizo Nduja Sausage 12 days Tandoori Chicken 10 days";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const name of ["Pepperoni", "Chorizo", "Nduja Sausage"]) {
      const rule: ShelfRule | undefined = result.pack.rules.find(
        (item) => item.name === name && item.sectionId === "frozen",
      );
      assert.ok(rule, name);
      assert.equal(rule.fromDelivery, "12 days");
      assert.equal(rule.inUse, "12 days");
    }
    const tandoori: ShelfRule | undefined = result.pack.rules.find(
      (item) => item.name === "Tandoori Chicken" && item.sectionId === "frozen",
    );
    assert.ok(tandoori);
    assert.equal(tandoori.fromDelivery, "10 days");
  });

  it("keeps every name in a Date on pack column, not only the last", () => {
    const text =
      "Ham Mushrooms Onions Date on pack Date on pack Date on pack 6 days 5 days 5 days";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const name of ["Ham", "Mushrooms", "Onions"]) {
      const rule: ShelfRule | undefined = result.pack.rules.find(
        (item) => item.name === name && item.sectionId === "chilled",
      );
      assert.ok(rule, name);
    }
    assert.equal(
      result.pack.rules.find((item) => item.name === "Ham")?.prepped,
      "6 days",
    );
    assert.equal(
      result.pack.rules.find((item) => item.name === "Mushrooms")?.prepped,
      "5 days",
    );
  });

  it("loads Campaign 5 when header dates are missing by using the bundled chart dates", () => {
    const text =
      "Campaign 5 shelf life chart. All stores. Version 1. Pepperoni 12 days Chorizo 12 days";
    const result = packFromPdfText(text, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pack.chart.issued, "2026-09-07");
    assert.equal(result.pack.chart.validUntil, "2026-11-17");
  });

  it("still shares one life when names are joined with a slash or and", () => {
    assert.equal(prepped("Pineapple / Olives 9 days", "Pineapple"), "9 days");
    assert.equal(prepped("Pineapple / Olives 9 days", "Olives"), "9 days");
    assert.equal(prepped("Pineapple and Olives 9 days", "Pineapple"), "9 days");
    assert.equal(prepped("Pineapple and Olives 9 days", "Olives"), "9 days");
  });

  it("merges a life cell that wraps onto the next PDF line", () => {
    const text = [
      "Prepared Double Decadence bases N/A 12 hours chilled",
      "4 hours ambient",
      "Pineapple Date on pack 10 days N/A",
    ].join("\n");
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const decadence = result.pack.rules.find(
      (item) => item.name === "Prepared Double Decadence bases",
    );
    const pineapple = result.pack.rules.find((item) => item.name === "Pineapple");
    assert.ok(decadence);
    assert.equal(decadence.prepped, "12 hours chilled");
    assert.equal(decadence.ambientUse, "4 hours");
    assert.ok(pineapple);
    assert.equal(pineapple.prepped, "10 days");
    assert.equal(pineapple.ambientUse, "N/A");
  });

  it("keeps a chilled/ambient companion with the prior product when a name splits the cell", () => {
    const text =
      "Prepared Double Decadence bases N/A 12 hours chilled Pineapple 6 hours ambient Date on pack 10 days N/A";
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
    assert.equal(pineapple.prepped, "10 days");
    assert.equal(pineapple.ambientUse, "N/A");
  });

  it("assigns a life column of hours one count per name", () => {
    const text = "Garlic Butter Pizza Sauce 12 hours 15 hours";
    const result = packFromPdfText(`${HEADER}${text}`, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const garlic = result.pack.rules.find((item) => item.name === "Garlic Butter");
    const pizza = result.pack.rules.find((item) => item.name === "Pizza Sauce");
    assert.ok(garlic);
    assert.equal(garlic.ambientUse, "12 hours");
    assert.ok(pizza);
    assert.equal(pizza.ambientUse, "15 hours");
  });

  it("rejects a Campaign 6 title without issued/valid-until dates", () => {
    const text =
      "Campaign 6 shelf life chart. All stores. Version 1. Pepperoni 12 days Chorizo 12 days";
    const result = packFromPdfText(text, "campaign-6.pdf");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Issued \/ Valid until/i);
  });

  it("keeps Campaign 6 dates instead of borrowing Campaign 5 identity", () => {
    const text =
      "Campaign 6 shelf life chart. All stores. Version 2. Issued on 18 November 2026. Valid until 31 January 2027. Pepperoni 14 days Chorizo 14 days";
    const result = packFromPdfText(text, "campaign-6.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.pack.chart.title, /Campaign 6/i);
    assert.equal(result.pack.chart.issued, "2026-11-18");
    assert.equal(result.pack.chart.validUntil, "2027-01-31");
    assert.ok(result.pack.rules.some((item) => item.name === "Pepperoni"));
  });

  it("reads ordinals, colons, and UK numeric Issued/Valid until dates", () => {
    assert.deepEqual(
      scrapeCampaignDates(
        "Issued on 7th September 2026. Valid until 17th November 2026.",
      ),
      { issued: "2026-09-07", validUntil: "2026-11-17" },
    );
    assert.deepEqual(
      scrapeCampaignDates("Issued: 7 September 2026 Valid until: 17 November 2026"),
      { issued: "2026-09-07", validUntil: "2026-11-17" },
    );
    assert.deepEqual(
      scrapeCampaignDates("Issued on 07/09/2026. Valid until 17/11/2026."),
      { issued: "2026-09-07", validUntil: "2026-11-17" },
    );
    assert.deepEqual(
      scrapeCampaignDates("Issue date 18 Nov 2026. Valid until 31 Jan 2027."),
      { issued: "2026-11-18", validUntil: "2027-01-31" },
    );

    const ordinals = packFromPdfText(
      "Campaign 6 shelf life chart. Issued on 7th September 2026. Valid until 17th November 2026. Pepperoni 12 days",
      "campaign-6.pdf",
    );
    assert.equal(ordinals.ok, true);
    if (!ordinals.ok) return;
    assert.equal(ordinals.pack.chart.issued, "2026-09-07");
    assert.equal(ordinals.pack.chart.validUntil, "2026-11-17");
  });

  it("reads stacked Issued/Valid until labels with both dates after", () => {
    const text =
      "Campaign 5 Shelf Life All stores Version 1 Issued on Valid until 7 September 2026 17 November 2026 Pepperoni 12 days";
    assert.deepEqual(scrapeCampaignDates(text), {
      issued: "2026-09-07",
      validUntil: "2026-11-17",
    });
    const result = packFromPdfText(text, "campaign-5.pdf");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pack.chart.issued, "2026-09-07");
    assert.equal(result.pack.chart.validUntil, "2026-11-17");
  });

  it("reads date ranges (to / dash / Valid from … to …)", () => {
    assert.deepEqual(
      scrapeCampaignDates("16th November 2026 to 4th January 2027"),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Valid from 16th November 2026 to 4th January 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates("16th November 2026 – 4th January 2027"),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates("16th November 2026 - 4th January 2027"),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );

    const result = packFromPdfText(
      "Campaign 6 shelf life chart. All stores. 16th November 2026 to 4th January 2027. Pepperoni 14 days Chorizo 14 days",
      "campaign-6.pdf",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pack.chart.issued, "2026-11-16");
    assert.equal(result.pack.chart.validUntil, "2027-01-04");
    assert.ok(result.pack.rules.some((item) => item.name === "Pepperoni"));
  });

  it("reads Issued on / Valid to and related stacked labels", () => {
    assert.deepEqual(
      scrapeCampaignDates(
        "Issued on Valid to 16th November 2026 4th January 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Issue date Valid to 16th November 2026 4th January 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Issued on Valid till 16th November 2026 4th January 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Valid from / Valid to 16th November 2026 4th January 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Issued on Valid from Valid to 16th November 2026 4th January 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Issued on 16th November 2026 Valid to 4th January 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );

    const result = packFromPdfText(
      "Campaign 6 shelf life chart. Issued on Valid to 16th November 2026 4th January 2027. Pepperoni 14 days",
      "campaign-6.pdf",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pack.chart.issued, "2026-11-16");
    assert.equal(result.pack.chart.validUntil, "2027-01-04");
  });

  it("reads Issued on / Valid to when All stores / Version sit between labels and dates", () => {
    assert.deepEqual(
      scrapeCampaignDates(
        "Issued on Valid to All stores Version 1 16th November 2026 4th January 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "16th November 2026 4th January 2027 Issued on Valid to",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Issued on Valid to 16 th November 2026 4 th January 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );

    const result = packFromPdfText(
      "Campaign 6 Shelf Life Issued on Valid to All stores Version 2 16th November 2026 4th January 2027 Pepperoni 14 days",
      "campaign-6.pdf",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pack.chart.issued, "2026-11-16");
    assert.equal(result.pack.chart.validUntil, "2027-01-04");
  });

  it("reads header date pairs with commas, glued months, or no to between dates", () => {
    assert.deepEqual(
      scrapeCampaignDates(
        "Issued on Valid to 16th November, 2026 4th January, 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Issued on Valid to 16thNovember 2026 4thJanuary 2027",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Campaign 6 Shelf Life All stores Version 1 16th November 2026 4th January 2027 Pepperoni 14 days",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );
    assert.deepEqual(
      scrapeCampaignDates(
        "Valid to Issued on 4th January 2027 16th November 2026",
      ),
      { issued: "2026-11-16", validUntil: "2027-01-04" },
    );

    const result = packFromPdfText(
      "Campaign 6 Shelf Life All stores Version 1 16th November, 2026 4th January, 2027 Pepperoni 14 days Chorizo 14 days",
      "campaign-6.pdf",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pack.chart.issued, "2026-11-16");
    assert.equal(result.pack.chart.validUntil, "2027-01-04");
  });
});
