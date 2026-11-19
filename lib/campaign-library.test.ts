import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import type { CampaignLibrary } from "./campaign-records";
import { emptyCampaignLibrary, writeStoreSettings } from "./campaign-records";
import type { ItemPreset } from "./item-preset-store";
import type { ChartPack } from "./types";

const preset: ItemPreset = {
  section: "frozen",
  life: "stock",
  sectionFilter: "frozen",
  lifeFilter: "all",
  category: "all",
  defaults: {},
};

function memoryLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

function pack(
  issued: string,
  validUntil: string,
  title: string,
  pepperoniDays: string,
): ChartPack {
  return {
    chart: {
      title,
      audience: "All stores",
      version: "1",
      issued,
      validUntil,
    },
    sections: [
      {
        id: "frozen",
        title: "Frozen",
        short: "Frozen",
        note: "",
      },
    ],
    footnotes: [],
    rules: [
      {
        id: "frozen:pepperoni",
        sectionId: "frozen",
        category: "Toppings",
        name: "Pepperoni",
        aliases: [],
        sameAs: [],
        fromDelivery: pepperoniDays,
        inUse: pepperoniDays,
      },
    ],
  };
}

function pepperoniLife(chartPack: ChartPack) {
  return chartPack.rules.find((rule) => rule.name === "Pepperoni")?.fromDelivery;
}

describe("campaign library import activates desk", () => {
  let pickActivateCampaignKey: typeof import("./campaign-library").pickActivateCampaignKey;
  let pickPresetCopySourceKey: typeof import("./campaign-library").pickPresetCopySourceKey;
  let copyCampaignPresetOnto: typeof import("./campaign-library").copyCampaignPresetOnto;
  let importStoredStoreSelections: typeof import("./campaign-library").importStoredStoreSelections;
  let replaceCampaignLibrary: typeof import("./campaign-library").replaceCampaignLibrary;
  let importStoredStores: typeof import("./campaign-library").importStoredStores;
  let getCampaignLibrary: typeof import("./campaign-library").getCampaignLibrary;
  let setImportedPack: typeof import("./desk-store").setImportedPack;
  let clearImportedPack: typeof import("./desk-store").clearImportedPack;
  let getDeskState: typeof import("./desk-store").getDeskState;
  let setStoreId: typeof import("./store-id-store").setStoreId;

  before(async () => {
    const storage = memoryLocalStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage: storage,
    };
    ({
      pickActivateCampaignKey,
      pickPresetCopySourceKey,
      copyCampaignPresetOnto,
      importStoredStoreSelections,
      replaceCampaignLibrary,
      importStoredStores,
      getCampaignLibrary,
    } = await import("./campaign-library"));
    ({ setImportedPack, clearImportedPack, getDeskState } = await import("./desk-store"));
    ({ setStoreId } = await import("./store-id-store"));
  });

  beforeEach(() => {
    window.localStorage.clear();
    clearImportedPack();
    setStoreId("");
    replaceCampaignLibrary(emptyCampaignLibrary());
  });

  it("picks the newest validUntil even when the desk key is also imported", () => {
    assert.equal(
      pickActivateCampaignKey(
        ["2026-09-07|2026-11-17", "2026-11-18|2027-01-31"],
        "2026-09-07|2026-11-17",
      ),
      "2026-11-18|2027-01-31",
    );
    assert.equal(
      pickActivateCampaignKey(
        ["2026-09-07|2026-11-17", "2026-11-18|2027-01-31"],
        "2025-01-01|2025-06-01",
      ),
      "2026-11-18|2027-01-31",
    );
    assert.equal(pickActivateCampaignKey([], "2026-09-07|2026-11-17"), null);
  });

  it("replaces the desk pack when a stored import updates the same campaign", () => {
    const packA = pack("2026-09-07", "2026-11-17", "Campaign 5", "12 days");
    const packB = pack("2026-09-07", "2026-11-17", "Campaign 5 revised", "14 days");
    setStoreId("12345");
    setImportedPack(packA, "old.pdf");

    let incoming: CampaignLibrary = emptyCampaignLibrary();
    incoming = {
      campaigns: [
        {
          issued: packB.chart.issued,
          validUntil: packB.chart.validUntil,
          title: packB.chart.title,
          version: packB.chart.version,
          sourceUrl: "new.pdf",
          savedAt: "t2",
          pack: packB,
        },
      ],
      stores: {},
    };
    incoming = writeStoreSettings(incoming, "12345", packB.chart.issued, packB.chart.validUntil, {
      hidden: [{ name: "Olives", section: null }],
      preset,
      compactDates: true,
      showDayCounts: false,
      compactList: false,
    });

    const ok = importStoredStoreSelections(incoming, [
      {
        storeId: "12345",
        selection: {
          dates: true,
          campaignKey: "2026-09-07|2026-11-17",
          hiddenKeys: ["Olives"],
        },
      },
    ]);
    assert.equal(ok, true);
    assert.equal(getDeskState().pack.chart.title, "Campaign 5 revised");
    assert.equal(pepperoniLife(getDeskState().pack), "14 days");
    assert.equal(pepperoniLife(getCampaignLibrary().campaigns[0]!.pack), "14 days");
  });

  it("switches the desk to a newer campaign from a stored import", () => {
    const packA = pack("2026-09-07", "2026-11-17", "Campaign 5", "12 days");
    const packB = pack("2026-11-18", "2027-01-31", "Campaign 6", "15 days");
    setStoreId("12345");
    setImportedPack(packA, "old.pdf");

    let incoming: CampaignLibrary = {
      campaigns: [
        {
          issued: packB.chart.issued,
          validUntil: packB.chart.validUntil,
          title: packB.chart.title,
          version: packB.chart.version,
          sourceUrl: "campaign6.pdf",
          savedAt: "t3",
          pack: packB,
        },
      ],
      stores: {},
    };
    incoming = writeStoreSettings(incoming, "12345", packB.chart.issued, packB.chart.validUntil, {
      hidden: [],
      preset,
      compactDates: false,
      showDayCounts: false,
      compactList: false,
    });

    const ok = importStoredStoreSelections(incoming, [
      {
        storeId: "12345",
        selection: {
          dates: true,
          campaignKey: "2026-11-18|2027-01-31",
        },
      },
    ]);
    assert.equal(ok, true);
    assert.equal(getDeskState().pack.chart.title, "Campaign 6");
    assert.equal(getDeskState().pack.chart.issued, "2026-11-18");
    assert.equal(pepperoniLife(getDeskState().pack), "15 days");
  });

  it("activates the imported pack after a full library replace", () => {
    const packA = pack("2026-09-07", "2026-11-17", "Campaign 5", "12 days");
    const packB = pack("2026-11-18", "2027-01-31", "Campaign 6", "15 days");
    setStoreId("99");
    setImportedPack(packA, "old.pdf");

    let incoming: CampaignLibrary = {
      campaigns: [
        {
          issued: packB.chart.issued,
          validUntil: packB.chart.validUntil,
          title: packB.chart.title,
          version: packB.chart.version,
          sourceUrl: "b.pdf",
          savedAt: "t4",
          pack: packB,
        },
      ],
      stores: {},
    };
    incoming = writeStoreSettings(incoming, "99", packB.chart.issued, packB.chart.validUntil, {
      hidden: [],
      preset,
    });
    replaceCampaignLibrary(incoming);
    assert.equal(getDeskState().pack.chart.title, "Campaign 6");
    assert.equal(pepperoniLife(getDeskState().pack), "15 days");
  });

  it("activates the imported pack after merging selected stores", () => {
    const packA = pack("2026-09-07", "2026-11-17", "Campaign 5", "12 days");
    const packB = pack("2026-09-07", "2026-11-17", "Campaign 5 fresh", "16 days");
    setStoreId("55");
    setImportedPack(packA, "old.pdf");

    let incoming: CampaignLibrary = {
      campaigns: [
        {
          issued: packB.chart.issued,
          validUntil: packB.chart.validUntil,
          title: packB.chart.title,
          version: packB.chart.version,
          sourceUrl: "fresh.pdf",
          savedAt: "t5",
          pack: packB,
        },
      ],
      stores: {},
    };
    incoming = writeStoreSettings(incoming, "55", packB.chart.issued, packB.chart.validUntil, {
      hidden: [],
      preset,
    });
    assert.equal(importStoredStores(incoming, ["55"]), true);
    assert.equal(getDeskState().pack.chart.title, "Campaign 5 fresh");
    assert.equal(pepperoniLife(getDeskState().pack), "16 days");
  });

  it("still updates the desk immediately on a direct chart import", () => {
    const packA = pack("2026-09-07", "2026-11-17", "Campaign 5", "12 days");
    const packB = pack("2026-11-18", "2027-01-31", "Campaign 6", "15 days");
    setImportedPack(packA, "a.pdf");
    setImportedPack(packB, "b.pdf");
    assert.equal(getDeskState().pack.chart.title, "Campaign 6");
    assert.equal(pepperoniLife(getDeskState().pack), "15 days");
  });

  it("refreshes Settings store campaign title after a same-key pack import", () => {
    const packA = pack("2026-09-07", "2026-11-17", "Campaign 5", "12 days");
    const packB = pack("2026-09-07", "2026-11-17", "Campaign 5 revised", "14 days");
    setStoreId("12345");
    setImportedPack(packA, "old.pdf");
    assert.equal(
      getCampaignLibrary().stores["12345"]?.campaigns["2026-09-07|2026-11-17"]?.title,
      "Campaign 5",
    );

    let incoming: CampaignLibrary = {
      campaigns: [
        {
          issued: packB.chart.issued,
          validUntil: packB.chart.validUntil,
          title: packB.chart.title,
          version: packB.chart.version,
          sourceUrl: "new.pdf",
          savedAt: "t6",
          pack: packB,
        },
      ],
      stores: {},
    };
    incoming = writeStoreSettings(incoming, "12345", packB.chart.issued, packB.chart.validUntil, {
      hidden: [],
      preset,
      compactDates: true,
    });
    assert.equal(
      importStoredStoreSelections(incoming, [
        {
          storeId: "12345",
          selection: {
            dates: true,
            campaignKey: "2026-09-07|2026-11-17",
          },
        },
      ]),
      true,
    );
    assert.equal(getDeskState().pack.chart.title, "Campaign 5 revised");
    assert.equal(
      getCampaignLibrary().stores["12345"]?.campaigns["2026-09-07|2026-11-17"]?.title,
      "Campaign 5 revised",
    );
  });

  it("picks a previous campaign preset as the copy source for a new chart", () => {
    const packA = pack("2026-09-07", "2026-11-17", "Campaign 5", "12 days");
    const packB = pack("2026-11-18", "2027-01-31", "Campaign 6", "15 days");
    setStoreId("12345");
    setImportedPack(packA, "a.pdf");
    setImportedPack(packB, "b.pdf");
    replaceCampaignLibrary(
      writeStoreSettings(
        getCampaignLibrary(),
        "12345",
        "2026-09-07",
        "2026-11-17",
        {
          hidden: [{ name: "Bacon", section: null }],
          preset,
          compactDates: true,
        },
      ),
    );
    assert.equal(
      pickPresetCopySourceKey(
        "12345",
        "2026-11-18|2027-01-31",
        "2026-09-07|2026-11-17",
      ),
      "2026-09-07|2026-11-17",
    );
    assert.equal(
      copyCampaignPresetOnto(
        "12345",
        "2026-09-07|2026-11-17",
        "2026-11-18|2027-01-31",
        {
          campaignKey: "2026-11-18|2027-01-31",
          fromCampaignKey: "2026-09-07|2026-11-17",
          hiddenKeys: ["Bacon"],
        },
      ),
      true,
    );
    assert.deepEqual(
      getCampaignLibrary().stores["12345"]?.campaigns["2026-11-18|2027-01-31"]
        ?.hidden,
      [{ name: "Bacon", section: null }],
    );
  });

  it("activates the newer campaign when the import includes both old and new keys", () => {
    const packA = pack("2026-09-07", "2026-11-17", "Campaign 5", "12 days");
    const packB = pack("2026-11-18", "2027-01-31", "Campaign 6", "15 days");
    setStoreId("12345");
    setImportedPack(packA, "old.pdf");

    let incoming: CampaignLibrary = {
      campaigns: [
        {
          issued: packA.chart.issued,
          validUntil: packA.chart.validUntil,
          title: packA.chart.title,
          version: packA.chart.version,
          sourceUrl: "old.pdf",
          savedAt: "t7",
          pack: packA,
        },
        {
          issued: packB.chart.issued,
          validUntil: packB.chart.validUntil,
          title: packB.chart.title,
          version: packB.chart.version,
          sourceUrl: "new.pdf",
          savedAt: "t8",
          pack: packB,
        },
      ],
      stores: {},
    };
    incoming = writeStoreSettings(incoming, "12345", packA.chart.issued, packA.chart.validUntil, {
      hidden: [],
      preset,
    });
    incoming = writeStoreSettings(incoming, "12345", packB.chart.issued, packB.chart.validUntil, {
      hidden: [],
      preset,
    });
    assert.equal(
      importStoredStoreSelections(incoming, [
        {
          storeId: "12345",
          selection: {
            dates: true,
            campaignKey: "2026-09-07|2026-11-17",
          },
        },
        {
          storeId: "12345",
          selection: {
            dates: true,
            campaignKey: "2026-11-18|2027-01-31",
          },
        },
      ]),
      true,
    );
    assert.equal(getDeskState().pack.chart.title, "Campaign 6");
    assert.equal(getDeskState().pack.chart.issued, "2026-11-18");
  });
});
