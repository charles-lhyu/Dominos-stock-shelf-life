import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHiddenEntries } from "./hidden-entries";
import {
  campaignKey,
  copyStoreData,
  emptyCampaignLibrary,
  dropAllStoredDefaults,
  dropAllStoredHidden,
  dropStoredDefault,
  dropStoredHidden,
  setStoredDefault,
  listCampaignSummaries,
  listDeviceStored,
  listDeviceStoreSettings,
  listStoreCampaigns,
  listStoreSettingChanges,
  applyAcceptedStoreChanges,
  parseCampaignLibrary,
  planStoreChange,
  readStoreSettings,
  readStoreName,
  upsertCampaign,
  writeStoreName,
  writeStoreSettings,
  writeStoreSettingsRecord,
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
      hidden: parseHiddenEntries(["Olives"]),
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
    assert.deepEqual(
      readStoreSettings(library, "12345", "2026-09-07", "2026-11-17")?.hidden,
      parseHiddenEntries(["Olives"]),
    );
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
      current: { hidden: parseHiddenEntries(["Bacon"]), preset },
    });
    assert.equal(first.restore, null);
    assert.deepEqual(
      readStoreSettings(first.library, "12345", "2026-09-07", "2026-11-17")?.hidden,
      parseHiddenEntries(["Bacon"]),
    );

    library = writeStoreSettings(first.library, "99", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Olives"]),
      preset: { ...preset, section: "chilled", sectionFilter: "chilled" },
    });
    const switched = planStoreChange({
      library,
      previousStoreId: "12345",
      nextStoreId: "99",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: parseHiddenEntries(["Bacon", "Ham"]), preset },
    });
    assert.deepEqual(switched.restore?.hidden, parseHiddenEntries(["Olives"]));
    assert.equal(switched.restore?.preset.section, "chilled");
    assert.deepEqual(
      readStoreSettings(switched.library, "12345", "2026-09-07", "2026-11-17")?.hidden, parseHiddenEntries(["Bacon", "Ham"]),
    );
    assert.deepEqual(
      readStoreSettings(switched.library, "99", "2026-09-07", "2026-11-17")?.hidden,
      parseHiddenEntries(["Olives"]),
    );
  });

  it("writes the screen onto a store that already has this campaign when asked to keep settings", () => {
    let library = writeStoreSettings(emptyCampaignLibrary(), "99", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Olives"]),
      preset,
    });
    const kept = planStoreChange({
      library,
      previousStoreId: "12345",
      nextStoreId: "99",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: parseHiddenEntries(["Bacon"]), preset },
      keepCurrent: true,
    });
    assert.equal(kept.restore, null);
    assert.deepEqual(readStoreSettings(kept.library, "99", "2026-09-07", "2026-11-17")?.hidden, parseHiddenEntries(["Bacon"]));
    assert.deepEqual(
      readStoreSettings(kept.library, "12345", "2026-09-07", "2026-11-17")?.hidden, parseHiddenEntries(["Bacon"]),
    );
  });

  it("loads a saved store or clears the screen when asked not to keep settings", () => {
    const library = writeStoreSettings(emptyCampaignLibrary(), "99", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Olives"]),
      preset,
    });
    const loaded = planStoreChange({
      library,
      previousStoreId: "12345",
      nextStoreId: "99",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: parseHiddenEntries(["Bacon"]), preset },
      keepCurrent: false,
    });
    assert.deepEqual(loaded.restore?.hidden, parseHiddenEntries(["Olives"]));
    assert.deepEqual(readStoreSettings(loaded.library, "99", "2026-09-07", "2026-11-17")?.hidden, parseHiddenEntries(["Olives"]));

    const fresh = planStoreChange({
      library: loaded.library,
      previousStoreId: "99",
      nextStoreId: "77",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: parseHiddenEntries(["Olives"]), preset },
      keepCurrent: false,
    });
    assert.deepEqual(fresh.restore?.hidden, []);
    assert.equal(readStoreSettings(fresh.library, "77", "2026-09-07", "2026-11-17"), null);
    assert.deepEqual(readStoreSettings(fresh.library, "99", "2026-09-07", "2026-11-17")?.hidden, parseHiddenEntries(["Olives"]));
  });

  it("lists every store saved on the device", () => {
    let library = writeStoreSettings(emptyCampaignLibrary(), "12345", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon"]),
      preset,
    });
    library = writeStoreSettings(library, "99", "2026-10-01", "2026-12-01", {
      hidden: parseHiddenEntries(["Ham"]),
      preset,
    });
    const rows = listDeviceStored(library);
    assert.deepEqual(
      rows.map((row) => `${row.storeId}:${row.hidden[0]?.name}`),
      ["99:Ham", "12345:Bacon"],
    );
  });

  it("lists store settings cards for every store on the device", () => {
    let library = writeStoreSettingsRecord(emptyCampaignLibrary(), "42", {
      name: "City",
      compactDates: true,
      showDayCounts: false,
      compactList: true,
    });
    library = writeStoreSettings(library, "99", "2026-10-01", "2026-12-01", {
      hidden: parseHiddenEntries(["Ham"]),
      preset,
      compactDates: false,
      showDayCounts: true,
      compactList: false,
    });
    const rows = listDeviceStoreSettings(library);
    assert.deepEqual(
      rows.map((row) => ({
        storeId: row.storeId,
        name: row.name,
        compactDates: row.compactDates,
        showDayCounts: row.showDayCounts,
        compactList: row.compactList,
        campaignCount: row.campaignCount,
      })),
      [
        {
          storeId: "42",
          name: "City",
          compactDates: true,
          showDayCounts: false,
          compactList: true,
          campaignCount: 0,
        },
        {
          storeId: "99",
          name: "",
          compactDates: false,
          showDayCounts: true,
          compactList: false,
          campaignCount: 1,
        },
      ],
    );
  });

  it("copies store dates, list, and selected campaign items without the name", () => {
    let library = writeStoreSettingsRecord(emptyCampaignLibrary(), "11", {
      name: "Source",
      compactDates: true,
      showDayCounts: false,
      compactList: true,
    });
    library = writeStoreSettings(library, "11", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon", "Olives"]),
      preset: {
        ...preset,
        defaults: {
          Pepperoni: { section: "frozen", life: null },
          Ham: { section: "chilled", life: null },
        },
      },
      compactDates: true,
      showDayCounts: false,
      compactList: true,
    });
    library = writeStoreSettingsRecord(library, "22", {
      name: "Target",
      compactDates: false,
      showDayCounts: false,
      compactList: false,
    });
    const key = campaignKey("2026-09-07", "2026-11-17");
    assert.ok(key);
    library = copyStoreData(library, "11", "22", {
      dates: true,
      list: true,
      campaignKey: key,
      hiddenKeys: ["Bacon"],
      defaultNames: ["Pepperoni"],
    });
    assert.equal(readStoreName(library, "22"), "Target");
    assert.equal(library.stores["22"]?.settings.compactDates, true);
    assert.equal(library.stores["22"]?.settings.compactList, true);
    const copied = readStoreSettings(library, "22", "2026-09-07", "2026-11-17");
    assert.deepEqual(
      copied?.hidden.map((entry) => entry.name),
      ["Bacon"],
    );
    assert.equal(copied?.preset.defaults.Pepperoni?.section, "frozen");
    assert.equal(copied?.preset.defaults.Ham, undefined);
  });

  it("removes selected target-only hidden items and defaults when copying", () => {
    let library = writeStoreSettings(emptyCampaignLibrary(), "11", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon"]),
      preset: {
        ...preset,
        defaults: { Pepperoni: { section: "frozen", life: null } },
      },
      compactDates: false,
      showDayCounts: false,
      compactList: false,
    });
    library = writeStoreSettings(library, "22", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon", "Olives"]),
      preset: {
        ...preset,
        defaults: {
          Pepperoni: { section: "frozen", life: null },
          Ham: { section: "chilled", life: null },
        },
      },
      compactDates: false,
      showDayCounts: false,
      compactList: false,
    });
    const key = campaignKey("2026-09-07", "2026-11-17");
    assert.ok(key);
    library = copyStoreData(library, "11", "22", {
      campaignKey: key,
      removeHiddenKeys: ["Olives"],
      removeDefaultNames: ["Ham"],
    });
    const next = readStoreSettings(library, "22", "2026-09-07", "2026-11-17");
    assert.deepEqual(
      next?.hidden.map((entry) => entry.name).sort(),
      ["Bacon"],
    );
    assert.equal(next?.preset.defaults.Pepperoni?.section, "frozen");
    assert.equal(next?.preset.defaults.Ham, undefined);
  });

  it("does not insert unselected source items when the target has no saved campaign", () => {
    let library = writeStoreSettings(emptyCampaignLibrary(), "11", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon", "Olives", "Mushrooms"]),
      preset: {
        ...preset,
        defaults: {
          Pepperoni: { section: "frozen", life: null },
          Ham: { section: "chilled", life: null },
          Dough: { section: "frozen", life: null },
        },
      },
      compactDates: true,
      showDayCounts: false,
      compactList: false,
    });
    library = writeStoreSettingsRecord(library, "22", {
      name: "Target",
      compactDates: false,
      showDayCounts: false,
      compactList: false,
    });
    const key = campaignKey("2026-09-07", "2026-11-17");
    assert.ok(key);
    library = copyStoreData(library, "11", "22", {
      dates: true,
      campaignKey: key,
      hiddenKeys: ["Bacon"],
      defaultNames: ["Pepperoni"],
    });
    const copied = readStoreSettings(library, "22", "2026-09-07", "2026-11-17");
    assert.deepEqual(
      copied?.hidden.map((entry) => entry.name).sort(),
      ["Bacon"],
    );
    assert.equal(copied?.preset.defaults.Pepperoni?.section, "frozen");
    assert.equal(copied?.preset.defaults.Ham, undefined);
    assert.equal(copied?.preset.defaults.Dough, undefined);
    assert.equal(library.stores["22"]?.settings.compactDates, true);
  });

  it("uses a live base so stale saved target items are not re-applied with a partial copy", () => {
    let library = writeStoreSettings(emptyCampaignLibrary(), "11", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon", "Olives"]),
      preset: {
        ...preset,
        defaults: {
          Pepperoni: { section: "frozen", life: null },
          Ham: { section: "chilled", life: null },
        },
      },
      compactDates: false,
      showDayCounts: false,
      compactList: false,
    });
    // Target saved copy already has Olives/Ham (stale vs the live screen).
    library = writeStoreSettings(library, "22", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Olives"]),
      preset: {
        ...preset,
        defaults: { Ham: { section: "chilled", life: null } },
      },
      compactDates: false,
      showDayCounts: false,
      compactList: false,
    });
    const key = campaignKey("2026-09-07", "2026-11-17");
    assert.ok(key);
    library = copyStoreData(library, "11", "22", {
      campaignKey: key,
      hiddenKeys: ["Bacon"],
      defaultNames: ["Pepperoni"],
      baseHidden: [],
      basePreset: preset,
    });
    const copied = readStoreSettings(library, "22", "2026-09-07", "2026-11-17");
    assert.deepEqual(
      copied?.hidden.map((entry) => entry.name),
      ["Bacon"],
    );
    assert.equal(copied?.preset.defaults.Pepperoni?.section, "frozen");
    assert.equal(copied?.preset.defaults.Ham, undefined);
  });

  it("leaves campaign items alone when the copy selection is only dates or empty", () => {
    let library = writeStoreSettings(emptyCampaignLibrary(), "11", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon", "Olives"]),
      preset: {
        ...preset,
        defaults: { Pepperoni: { section: "frozen", life: null } },
      },
      compactDates: true,
      showDayCounts: false,
      compactList: true,
    });
    library = writeStoreSettings(library, "22", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Ham"]),
      preset: {
        ...preset,
        defaults: { Dough: { section: "frozen", life: null } },
      },
      compactDates: false,
      showDayCounts: false,
      compactList: false,
    });
    const key = campaignKey("2026-09-07", "2026-11-17");
    assert.ok(key);
    const datesOnly = copyStoreData(library, "11", "22", {
      dates: true,
      list: true,
    });
    const afterDates = readStoreSettings(datesOnly, "22", "2026-09-07", "2026-11-17");
    assert.deepEqual(
      afterDates?.hidden.map((entry) => entry.name),
      ["Ham"],
    );
    assert.equal(afterDates?.preset.defaults.Dough?.section, "frozen");
    assert.equal(afterDates?.preset.defaults.Pepperoni, undefined);
    const closed = copyStoreData(library, "11", "22", {
      campaignKey: key,
      hiddenKeys: [],
      defaultNames: [],
    });
    assert.equal(closed, library);
  });

  it("keeps unnamed stores that only have display settings after parse", () => {
    const library = writeStoreSettingsRecord(emptyCampaignLibrary(), "77", {
      name: "",
      compactDates: true,
      showDayCounts: false,
      compactList: true,
    });
    const parsed = parseCampaignLibrary(JSON.parse(JSON.stringify(library)));
    assert.equal(parsed.stores["77"]?.settings.compactDates, true);
    assert.equal(parsed.stores["77"]?.settings.compactList, true);
    assert.equal(Object.keys(parsed.stores["77"]?.campaigns ?? {}).length, 0);
  });

  it("keeps the screen for a store that has no saved copy, and keeps the previous store when the id is cleared", () => {
    const library = writeStoreSettings(
      emptyCampaignLibrary(),
      "12345",
      "2026-09-07",
      "2026-11-17",
      { hidden: parseHiddenEntries(["Bacon"]), preset },
    );
    const fresh = planStoreChange({
      library,
      previousStoreId: "12345",
      nextStoreId: "77",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: parseHiddenEntries(["Gherkins"]), preset },
    });
    assert.equal(fresh.restore, null);
    assert.deepEqual(readStoreSettings(fresh.library, "77", "2026-09-07", "2026-11-17")?.hidden, parseHiddenEntries(["Gherkins"]));

    const cleared = planStoreChange({
      library: fresh.library,
      previousStoreId: "77",
      nextStoreId: "",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: parseHiddenEntries(["Gherkins"]), preset },
    });
    assert.equal(cleared.restore, null);
    assert.deepEqual(readStoreSettings(cleared.library, "77", "2026-09-07", "2026-11-17")?.hidden, parseHiddenEntries(["Gherkins"]));
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
          "2026-09-07|2026-11-17": { hidden: parseHiddenEntries([" Olives ", "Olives"]), preset: { section: "pack" } },
          bad: { hidden: parseHiddenEntries(["Ham"]) },
        },
        store: { "2026-09-07|2026-11-17": { hidden: parseHiddenEntries(["Ham"]) } },
      },
    });
    const titles = listCampaignSummaries(parsed).map((item) => item.title);
    assert.deepEqual(titles, ["Campaign 6", "Campaign 5"]);
    assert.equal("pdfCropImage" in parsed.campaigns[0]!.pack.rules[0]!, false);
    const settings = readStoreSettings(parsed, "12", "2026-09-07", "2026-11-17");
    assert.deepEqual(settings?.hidden, parseHiddenEntries(["Olives"]));
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
      hidden: parseHiddenEntries(["Olives", "Bacon"]),
      preset,
    });
    library = writeStoreSettings(library, "12345", "2026-10-01", "2026-12-01", {
      hidden: [],
      preset: { ...preset, category: "Sides", lifeFilter: "prepped" },
    });
    library = writeStoreSettings(library, "99", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Ham"]),
      preset,
    });

    const rows = listStoreCampaigns(library, "12345");
    assert.deepEqual(
      rows.map((row) => row.title),
      ["Campaign 6", "Campaign 5"],
    );
    assert.deepEqual(rows[1]?.hidden, parseHiddenEntries(["Bacon", "Olives"]));
    assert.equal(rows[0]?.preset.category, "Sides");
    assert.equal(rows[0]?.preset.lifeFilter, "prepped");
    assert.deepEqual(listStoreCampaigns(library, "99").map((row) => row.hidden[0]?.name), ["Ham"]);
    assert.deepEqual(listStoreCampaigns(library, ""), []);
  });

  it("shows storage defaults for multi-storage products and drops life-only defaults", () => {
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
      hidden: parseHiddenEntries(["Pepperoni"]),
      preset: {
        ...preset,
        defaults: {
          Pepperoni: { section: "chilled", life: "stock" },
          Dough: { section: "frozen", life: "stock" },
        },
      },
    });
    // Hidden multi-storage and single-storage life defaults are both dropped.
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
    assert.deepEqual(shown?.Pepperoni, { section: "chilled", life: null });
    assert.equal(shown?.Dough, undefined);
  });

  it("drops one hidden name or one product default from saved settings", () => {
    const settings = {
      hidden: parseHiddenEntries(["Bacon", "Olives"]),
      preset: {
        ...preset,
        defaults: {
          Pepperoni: { section: "chilled" as const, life: "stock" as const },
          Ham: { section: "frozen" as const, life: "prepped" as const },
        },
      },
    };
    const hidden = dropStoredHidden(settings, "Olives");
    assert.deepEqual(hidden.hidden, parseHiddenEntries(["Bacon"]));
    assert.equal(dropStoredHidden(hidden, "Missing"), hidden);
    const defaults = dropStoredDefault(settings, "Pepperoni");
    assert.equal(defaults.preset.defaults.Pepperoni, undefined);
    assert.equal(defaults.preset.defaults.Ham?.section, "frozen");
    assert.equal(dropStoredDefault(defaults, "Pepperoni"), defaults);
    const clearedHidden = dropAllStoredHidden(settings);
    assert.deepEqual(clearedHidden.hidden, []);
    assert.equal(dropAllStoredHidden(clearedHidden), clearedHidden);
    const clearedDefaults = dropAllStoredDefaults(settings);
    assert.deepEqual(clearedDefaults.preset.defaults, {});
    assert.equal(dropAllStoredDefaults(clearedDefaults), clearedDefaults);
  });

  it("changes a saved product default to another storage", () => {
    const settings = {
      hidden: [] as ReturnType<typeof parseHiddenEntries>,
      preset: {
        ...preset,
        defaults: {
          Pepperoni: { section: "chilled" as const, life: null },
        },
      },
    };
    const next = setStoredDefault(settings, "Pepperoni", "frozen");
    assert.deepEqual(next.preset.defaults.Pepperoni, { section: "frozen", life: null });
    assert.equal(setStoredDefault(next, "Pepperoni", "frozen"), next);
  });

  it("keeps a product storage default such as pepperoni chilled", () => {
    const library = writeStoreSettings(emptyCampaignLibrary(), "12345", "2026-09-07", "2026-11-17", {
      hidden: [],
      preset: {
        ...preset,
        defaults: { Pepperoni: { section: "chilled", life: "stock" } },
      },
    });
    const saved = readStoreSettings(library, "12345", "2026-09-07", "2026-11-17");
    assert.equal(saved?.preset.defaults.Pepperoni?.section, "chilled");
    // Life is never kept on a product default.
    assert.equal(saved?.preset.defaults.Pepperoni?.life, null);
  });

  it("stores short dates and day counts with the store and loads them back", () => {
    let library = upsertCampaign(
      emptyCampaignLibrary(),
      pack("2026-09-07", "2026-11-17"),
      "a.pdf",
      "t1",
    );
    library = writeStoreSettings(library, "12345", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon"]),
      preset,
      compactDates: true,
      showDayCounts: true,
    });
    const saved = readStoreSettings(library, "12345", "2026-09-07", "2026-11-17");
    assert.equal(saved?.compactDates, true);
    assert.equal(saved?.showDayCounts, true);
    assert.equal(saved?.compactList, false);
    const loaded = planStoreChange({
      library,
      previousStoreId: "99",
      nextStoreId: "12345",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current: { hidden: [], preset },
      keepCurrent: false,
    });
    assert.equal(loaded.restore?.compactDates, true);
    assert.equal(loaded.restore?.showDayCounts, true);
    const plain = readStoreSettings(
      writeStoreSettings(library, "99", "2026-09-07", "2026-11-17", { hidden: [], preset }),
      "99",
      "2026-09-07",
      "2026-11-17",
    );
    assert.equal(plain?.compactDates, false);
    assert.equal(plain?.showDayCounts, false);
  });

  it("lists store changes and applies only the accepted ones", () => {
    const current = {
      hidden: parseHiddenEntries(["Bacon"]),
      preset: {
        ...preset,
        defaults: { Pepperoni: { section: "chilled" as const, life: "stock" as const } },
      },
      compactDates: false,
      showDayCounts: false,
    };
    const saved = {
      hidden: parseHiddenEntries(["Olives"]),
      preset: {
        ...preset,
        defaults: { Pepperoni: { section: "frozen" as const, life: "stock" as const } },
      },
      compactDates: true,
      showDayCounts: false,
    };
    const changes = listStoreSettingChanges(current, saved);
    assert.deepEqual(
      changes.map((change) => change.id),
      ["dates:compact", "hidden:Bacon", "hidden:Olives", "default:Pepperoni"],
    );
    assert.equal(changes.find((change) => change.id === "dates:compact")?.to, "Short");
    const merged = applyAcceptedStoreChanges(current, saved, ["hidden:Olives", "dates:compact"]);
    assert.deepEqual(merged.hidden, parseHiddenEntries(["Bacon", "Olives"]));
    assert.equal(merged.compactDates, true);
    assert.equal(merged.preset.defaults.Pepperoni?.section, "chilled");
    assert.equal(applyAcceptedStoreChanges(current, null, []).compactDates, false);
    let library = upsertCampaign(
      emptyCampaignLibrary(),
      pack("2026-09-07", "2026-11-17"),
      "a.pdf",
      "t1",
    );
    library = writeStoreSettings(library, "99999", "2026-09-07", "2026-11-17", saved);
    const planned = planStoreChange({
      library,
      previousStoreId: "12345",
      nextStoreId: "99999",
      issued: "2026-09-07",
      validUntil: "2026-11-17",
      current,
      nextSettings: merged,
    });
    const previous = readStoreSettings(planned.library, "12345", "2026-09-07", "2026-11-17");
    const next = readStoreSettings(planned.library, "99999", "2026-09-07", "2026-11-17");
    assert.deepEqual(previous?.hidden, parseHiddenEntries(["Bacon"]));
    assert.equal(previous?.compactDates, false);
    assert.deepEqual(next?.hidden, parseHiddenEntries(["Bacon", "Olives"]));
    assert.equal(next?.compactDates, true);
    assert.equal(next?.preset.defaults.Pepperoni?.section, "chilled");
    assert.equal(planned.restore?.compactDates, true);
  });

  it("keeps a custom store name with the store", () => {
    let library = writeStoreName(emptyCampaignLibrary(), "12345", "  Oxford Street  ");
    assert.equal(readStoreName(library, "12345"), "Oxford Street");
    library = writeStoreSettings(library, "12345", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon"]),
      preset,
    });
    library = upsertCampaign(library, pack("2026-09-07", "2026-11-17"), "b.pdf", "t2");
    const parsed = parseCampaignLibrary(JSON.parse(JSON.stringify(library)));
    assert.equal(readStoreName(parsed, "12345"), "Oxford Street");
    assert.equal(readStoreName(writeStoreName(parsed, "12345", " "), "12345"), "");
  });

  it("migrates legacy flat store settings into store settings and campaign presets", () => {
    const parsed = parseCampaignLibrary({
      campaigns: [
        {
          issued: "2026-09-07",
          validUntil: "2026-11-17",
          title: "Campaign 5",
          version: "5.1",
          sourceUrl: "a.pdf",
          savedAt: "t1",
          pack: pack("2026-09-07", "2026-11-17"),
        },
      ],
      storeNames: { "12345": "High Street" },
      stores: {
        "12345": {
          "2026-09-07|2026-11-17": {
            hidden: parseHiddenEntries(["Bacon"]),
            preset,
            compactDates: true,
            showDayCounts: false,
            compactList: true,
          },
        },
      },
    });
    assert.equal(parsed.stores["12345"]?.settings.name, "High Street");
    assert.equal(parsed.stores["12345"]?.settings.compactDates, true);
    assert.equal(parsed.stores["12345"]?.settings.compactList, true);
    const presetRow = parsed.stores["12345"]?.campaigns["2026-09-07|2026-11-17"];
    assert.equal(presetRow?.title, "Campaign 5");
    assert.equal(presetRow?.version, "5.1");
    assert.deepEqual(presetRow?.hidden, parseHiddenEntries(["Bacon"]));
    assert.equal((parsed as { storeNames?: unknown }).storeNames, undefined);
  });

  it("shares store date and list settings across campaign presets", () => {
    let library = upsertCampaign(
      emptyCampaignLibrary(),
      pack("2026-09-07", "2026-11-17", "Campaign 5"),
      "a.pdf",
      "t1",
    );
    library = upsertCampaign(library, pack("2026-10-01", "2026-12-01", "Campaign 6"), "b.pdf", "t2");
    library = writeStoreSettings(library, "12345", "2026-09-07", "2026-11-17", {
      hidden: parseHiddenEntries(["Bacon"]),
      preset,
      compactDates: true,
      compactList: true,
    });
    library = writeStoreSettings(library, "12345", "2026-10-01", "2026-12-01", {
      hidden: [],
      preset,
      compactDates: false,
      compactList: false,
    });
    const rows = listStoreCampaigns(library, "12345");
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.compactDates === false && row.compactList === false));
    assert.equal(rows[1]?.title, "Campaign 5");
    assert.deepEqual(rows[1]?.hidden, parseHiddenEntries(["Bacon"]));
  });
});
