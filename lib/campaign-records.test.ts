import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  campaignKey,
  emptyCampaignLibrary,
  listCampaignSummaries,
  listDeviceStored,
  listStoreCampaigns,
  parseCampaignLibrary,
  planStoreChange,
  readStoreSettings,
  upsertCampaign,
  writeStoreSettings,
} from "./campaign-records";
import type { ItemPreset } from "./item-preset-store";
import type { ChartPack } from "./types";

const preset: ItemPreset = {
  section: "frozen",
  life: "stock",
  sectionFilter: "frozen",
  lifeFilter: "stock",
  category: "all",
  defaults: {},
};

function pack(issued: string, validUntil: string, title = "Campaign 5"): ChartPack {
  return {
    chart: {
      title,
      audience: "Stores",
      version: "5",
      issued,
      validUntil,
    },
    sections: [],
    footnotes: [],
    rules: [
      {
        id: "pepperoni",
        sectionId: "frozen",
        category: "Toppings",
        name: "Pepperoni",
        aliases: [],
        sameAs: [],
        pdfCropImage: "data:image/jpeg;base64,abc",
      },
    ],
  };
}

describe("campaign library records", () => {
  it("keys a campaign by issued and valid dates", () => {
    assert.equal(campaignKey("2026-09-07", "2026-11-17"), "2026-09-07|2026-11-17");
    assert.equal(campaignKey("", "2026-11-17"), null);
    assert.equal(campaignKey("7 Sep 2026", "2026-11-17"), null);
  });

  it("stores a campaign without the PDF crop image and replaces the same dates", () => {
    let library = emptyCampaignLibrary();
    library = upsertCampaign(library, pack("2026-09-07", "2026-11-17"), "a.pdf", "t1");
    library = upsertCampaign(
      library,
      pack("2026-10-01", "2026-12-01", "Campaign 6"),
      "b.pdf",
      "t2",
    );
    library = writeStoreSettings(library, "12345", "2026-09-07", "2026-11-17", {
      hidden: ["Olives"],
      preset,
    });
    library = upsertCampaign(
      library,
      pack("2026-09-07", "2026-11-17", "Campaign 5 revised"),
      "c.pdf",
      "t3",
    );

    assert.equal(library.campaigns.length, 2);
    const revised = library.campaigns.find((item) => item.issued === "2026-09-07");
    assert.equal(revised?.title, "Campaign 5 revised");
    assert.equal(revised?.sourceUrl, "c.pdf");
    assert.equal("pdfCropImage" in (revised?.pack.rules[0] ?? {}), false);
    assert.deepEqual(readStoreSettings(library, "12345", "2026-09-07", "2026-11-17")?.hidden, [
      "Olives",
    ]);
    assert.equal(readStoreSettings(library, "99", "2026-09-07", "2026-11-17"), null);
  });

  it("saves the screen onto a new store id and restores a store that already has this campaign", () => {
    let library = upsertCampaign(
      emptyCampaignLibrary(),
      pack("2026-09-07", "2026-11-17"),
      "a.pdf",
      "t1",
    );
    const first = planStoreChange({
      library,
      previousStoreId: "",
      nextStoreId: "12345",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: ["Bacon"], preset },
    });
    assert.equal(first.restore, null);
    assert.deepEqual(readStoreSettings(first.library, "12345", "2026-09-07", "2026-11-17")?.hidden, [
      "Bacon",
    ]);

    library = writeStoreSettings(first.library, "99", "2026-09-07", "2026-11-17", {
      hidden: ["Olives"],
      preset: { ...preset, section: "chilled", sectionFilter: "chilled" },
    });
    const switched = planStoreChange({
      library,
      previousStoreId: "12345",
      nextStoreId: "99",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: ["Bacon", "Ham"], preset },
    });
    assert.deepEqual(switched.restore?.hidden, ["Olives"]);
    assert.equal(switched.restore?.preset.section, "chilled");
    assert.deepEqual(
      readStoreSettings(switched.library, "12345", "2026-09-07", "2026-11-17")?.hidden,
      ["Bacon", "Ham"],
    );
    assert.deepEqual(readStoreSettings(switched.library, "99", "2026-09-07", "2026-11-17")?.hidden, [
      "Olives",
    ]);
  });

  it("writes the screen onto a store that already has this campaign when asked to keep settings", () => {
    let library = writeStoreSettings(emptyCampaignLibrary(), "99", "2026-09-07", "2026-11-17", {
      hidden: ["Olives"],
      preset,
    });
    const kept = planStoreChange({
      library,
      previousStoreId: "12345",
      nextStoreId: "99",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: ["Bacon"], preset },
      keepCurrent: true,
    });
    assert.equal(kept.restore, null);
    assert.deepEqual(readStoreSettings(kept.library, "99", "2026-09-07", "2026-11-17")?.hidden, [
      "Bacon",
    ]);
    assert.deepEqual(
      readStoreSettings(kept.library, "12345", "2026-09-07", "2026-11-17")?.hidden,
      ["Bacon"],
    );
  });

  it("loads a saved store or clears the screen when asked not to keep settings", () => {
    const library = writeStoreSettings(emptyCampaignLibrary(), "99", "2026-09-07", "2026-11-17", {
      hidden: ["Olives"],
      preset,
    });
    const loaded = planStoreChange({
      library,
      previousStoreId: "12345",
      nextStoreId: "99",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: ["Bacon"], preset },
      keepCurrent: false,
    });
    assert.deepEqual(loaded.restore?.hidden, ["Olives"]);
    assert.deepEqual(readStoreSettings(loaded.library, "99", "2026-09-07", "2026-11-17")?.hidden, [
      "Olives",
    ]);

    const fresh = planStoreChange({
      library: loaded.library,
      previousStoreId: "99",
      nextStoreId: "77",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: ["Olives"], preset },
      keepCurrent: false,
    });
    assert.deepEqual(fresh.restore?.hidden, []);
    assert.equal(readStoreSettings(fresh.library, "77", "2026-09-07", "2026-11-17"), null);
    assert.deepEqual(readStoreSettings(fresh.library, "99", "2026-09-07", "2026-11-17")?.hidden, [
      "Olives",
    ]);
  });

  it("lists every store saved on the device", () => {
    let library = writeStoreSettings(emptyCampaignLibrary(), "12345", "2026-09-07", "2026-11-17", {
      hidden: ["Bacon"],
      preset,
    });
    library = writeStoreSettings(library, "99", "2026-10-01", "2026-12-01", {
      hidden: ["Ham"],
      preset,
    });
    const rows = listDeviceStored(library);
    assert.deepEqual(
      rows.map((row) => `${row.storeId}:${row.hidden[0]}`),
      ["99:Ham", "12345:Bacon"],
    );
  });

  it("keeps the screen for a store that has no saved copy, and keeps the previous store when the id is cleared", () => {
    const library = writeStoreSettings(
      emptyCampaignLibrary(),
      "12345",
      "2026-09-07",
      "2026-11-17",
      { hidden: ["Bacon"], preset },
    );
    const fresh = planStoreChange({
      library,
      previousStoreId: "12345",
      nextStoreId: "77",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: ["Gherkins"], preset },
    });
    assert.equal(fresh.restore, null);
    assert.deepEqual(readStoreSettings(fresh.library, "77", "2026-09-07", "2026-11-17")?.hidden, [
      "Gherkins",
    ]);

    const cleared = planStoreChange({
      library: fresh.library,
      previousStoreId: "77",
      nextStoreId: "",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: ["Gherkins"], preset },
    });
    assert.equal(cleared.restore, null);
    assert.deepEqual(readStoreSettings(cleared.library, "77", "2026-09-07", "2026-11-17")?.hidden, [
      "Gherkins",
    ]);
  });

  it("lists newer valid dates first and drops crop images when reading storage", () => {
    const parsed = parseCampaignLibrary({
      campaigns: [
        {
          issued: "2026-09-07",
          validUntil: "2026-11-17",
          title: "Campaign 5",
          version: "5",
          sourceUrl: "a.pdf",
          savedAt: "t1",
          pack: pack("2026-09-07", "2026-11-17"),
        },
        {
          title: "Campaign 6",
          sourceUrl: "b.pdf",
          savedAt: "t2",
          pack: pack("2026-10-01", "2026-12-01", "Campaign 6"),
        },
        { pack: { chart: { issued: "nope", validUntil: "" } } },
      ],
      stores: {
        "12": {
          "2026-09-07|2026-11-17": { hidden: [" Olives ", "Olives"], preset: { section: "pack" } },
          bad: { hidden: ["Ham"] },
        },
        store: { "2026-09-07|2026-11-17": { hidden: ["Ham"] } },
      },
    });
    const titles = listCampaignSummaries(parsed).map((item) => item.title);
    assert.deepEqual(titles, ["Campaign 6", "Campaign 5"]);
    assert.equal("pdfCropImage" in parsed.campaigns[0]!.pack.rules[0]!, false);
    const settings = readStoreSettings(parsed, "12", "2026-09-07", "2026-11-17");
    assert.deepEqual(settings?.hidden, ["Olives"]);
    assert.equal(settings?.preset.section, "pack");
    assert.equal(settings?.preset.lifeFilter, "all");
    assert.equal(parsed.stores.store, undefined);
  });

  it("lists one store's saved hidden items and item types per campaign", () => {
    let library = upsertCampaign(
      emptyCampaignLibrary(),
      pack("2026-09-07", "2026-11-17", "Campaign 5"),
      "a.pdf",
      "t1",
    );
    library = upsertCampaign(
      library,
      pack("2026-10-01", "2026-12-01", "Campaign 6"),
      "b.pdf",
      "t2",
    );
    library = writeStoreSettings(library, "12345", "2026-09-07", "2026-11-17", {
      hidden: ["Olives", "Bacon"],
      preset,
    });
    library = writeStoreSettings(library, "12345", "2026-10-01", "2026-12-01", {
      hidden: [],
      preset: { ...preset, category: "Sides", lifeFilter: "prepped" },
    });
    library = writeStoreSettings(library, "99", "2026-09-07", "2026-11-17", {
      hidden: ["Ham"],
      preset,
    });

    const rows = listStoreCampaigns(library, "12345");
    assert.deepEqual(
      rows.map((row) => row.title),
      ["Campaign 6", "Campaign 5"],
    );
    assert.deepEqual(rows[1]?.hidden, ["Bacon", "Olives"]);
    assert.equal(rows[0]?.preset.category, "Sides");
    assert.equal(rows[0]?.preset.lifeFilter, "prepped");
    assert.deepEqual(listStoreCampaigns(library, "99").map((row) => row.hidden[0]), ["Ham"]);
    assert.deepEqual(listStoreCampaigns(library, ""), []);
  });

  it("shows a default only when the product has another storage option and is not hidden", () => {
    const chart = pack("2026-09-07", "2026-11-17");
    chart.rules = [
      { ...chart.rules[0]!, sectionId: "frozen" },
      { ...chart.rules[0]!, id: "pepperoni-chilled", sectionId: "chilled" },
      {
        id: "dough",
        sectionId: "frozen",
        category: "Dough",
        name: "Dough",
        aliases: [],
        sameAs: [],
      },
    ];
    let library = upsertCampaign(emptyCampaignLibrary(), chart, "a.pdf", "t1");
    library = writeStoreSettings(library, "12345", "2026-09-07", "2026-11-17", {
      hidden: ["Pepperoni"],
      preset: {
        ...preset,
        defaults: {
          Pepperoni: { section: "chilled", life: "stock" },
          Dough: { section: "frozen", life: "stock" },
        },
      },
    });
    assert.deepEqual(listStoreCampaigns(library, "12345")[0]?.preset.defaults, {});

    library = writeStoreSettings(library, "12345", "2026-09-07", "2026-11-17", {
      hidden: [],
      preset: {
        ...preset,
        defaults: {
          Pepperoni: { section: "chilled", life: "stock" },
          Dough: { section: "frozen", life: "stock" },
        },
      },
    });
    const shown = listStoreCampaigns(library, "12345")[0]?.preset.defaults;
    assert.equal(shown?.Pepperoni?.section, "chilled");
    assert.equal(shown?.Pepperoni?.life, "stock");
    assert.equal(shown?.Dough, undefined);
  });

  it("keeps a product default such as pepperoni chilled from delivery", () => {
    const library = writeStoreSettings(emptyCampaignLibrary(), "12345", "2026-09-07", "2026-11-17", {
      hidden: [],
      preset: {
        ...preset,
        defaults: { Pepperoni: { section: "chilled", life: "stock" } },
      },
    });
    const saved = readStoreSettings(library, "12345", "2026-09-07", "2026-11-17");
    assert.equal(saved?.preset.defaults.Pepperoni?.section, "chilled");
    assert.equal(saved?.preset.defaults.Pepperoni?.life, "stock");
  });
});
