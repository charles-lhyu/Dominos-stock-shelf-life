import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyCampaignLibrary,
  parseCampaignLibrary,
  writeStoreName,
  writeStoreSettings,
  upsertCampaign,
} from "./campaign-records";
import type { ItemPreset } from "./item-preset-store";
import type { ChartPack } from "./types";
import {
  buildStoredLibraryPayload,
  mergeStoresIntoLibrary,
  parseStoredLibraryPayload,
  pickStoresFromLibrary,
  summarizeStoredLibrary,
  STORED_LIBRARY_FORMAT_V1,
  STORED_LIBRARY_FORMAT_V2,
} from "./stored-library-io";

const preset: ItemPreset = {
  section: "frozen",
  life: "stock",
  sectionFilter: "frozen",
  lifeFilter: "all",
  category: "all",
  defaults: {},
};

function pack(issued: string, validUntil: string, title = "Campaign 5"): ChartPack {
  return {
    chart: {
      title,
      audience: "",
      version: "1",
      issued,
      validUntil,
    },
    sections: [],
    footnotes: [],
    rules: [
      {
        id: "pepperoni-frozen",
        sectionId: "frozen",
        category: "Toppings",
        name: "Pepperoni",
        aliases: [],
        sameAs: [],
      },
    ],
  };
}

describe("stored library import export", () => {
  it("round-trips a store-first library in a v2 payload", () => {
    let library = upsertCampaign(
      emptyCampaignLibrary(),
      pack("2026-09-07", "2026-11-17"),
      "a.pdf",
      "t1",
    );
    library = writeStoreName(library, "12345", "Oxford");
    library = writeStoreSettings(library, "12345", "2026-09-07", "2026-11-17", {
      hidden: [],
      preset,
      compactDates: true,
    });
    const payload = buildStoredLibraryPayload(library, {
      storeId: "12345",
      exportedAt: "2026-10-28T12:00:00.000Z",
    });
    assert.equal(payload.format, STORED_LIBRARY_FORMAT_V2);
    assert.equal(payload.storeId, "12345");
    const parsed = parseStoredLibraryPayload(JSON.parse(JSON.stringify(payload)));
    assert.ok(parsed);
    assert.equal(parsed!.library.stores["12345"]?.settings.name, "Oxford");
    assert.equal(parsed!.library.stores["12345"]?.settings.compactDates, true);
    assert.deepEqual(summarizeStoredLibrary(parsed!.library), {
      stores: 1,
      campaigns: 1,
      charts: 1,
    });
  });

  it("accepts a legacy v1 wrapped payload and a raw legacy library", () => {
    const legacy = {
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
      ],
      storeNames: { "99": "Town" },
      stores: {
        "99": {
          "2026-09-07|2026-11-17": {
            hidden: ["Bacon"],
            preset,
            compactList: true,
          },
        },
      },
    };
    const wrapped = parseStoredLibraryPayload({
      format: STORED_LIBRARY_FORMAT_V1,
      exportedAt: "2026-10-01T00:00:00.000Z",
      library: legacy,
    });
    assert.ok(wrapped);
    assert.equal(wrapped!.library.stores["99"]?.settings.name, "Town");
    assert.equal(wrapped!.library.stores["99"]?.settings.compactList, true);

    const raw = parseStoredLibraryPayload(legacy);
    assert.ok(raw);
    assert.equal(raw!.library.stores["99"]?.campaigns["2026-09-07|2026-11-17"]?.title, "Campaign 5");

    assert.equal(parseStoredLibraryPayload({ format: "nope", library: legacy }), null);
    assert.deepEqual(parseCampaignLibrary(legacy).stores["99"]?.settings.name, "Town");
  });

  it("exports and merges individual stores without wiping the rest", () => {
    let library = upsertCampaign(
      emptyCampaignLibrary(),
      pack("2026-09-07", "2026-11-17"),
      "a.pdf",
      "t1",
    );
    library = writeStoreName(library, "11", "Source");
    library = writeStoreSettings(library, "11", "2026-09-07", "2026-11-17", {
      hidden: [],
      preset,
      compactDates: true,
    });
    library = writeStoreName(library, "22", "Keep");
    library = writeStoreSettings(library, "22", "2026-09-07", "2026-11-17", {
      hidden: [],
      preset,
      compactList: true,
    });
    const payload = buildStoredLibraryPayload(library, { storeIds: ["11"] });
    assert.deepEqual(Object.keys(payload.library.stores), ["11"]);
    assert.equal(payload.storeId, "11");
    assert.equal(payload.library.campaigns.length, 1);

    const picked = pickStoresFromLibrary(library, ["22"]);
    assert.deepEqual(Object.keys(picked.stores), ["22"]);

    const incoming = writeStoreName(
      writeStoreSettings(
        upsertCampaign(
          emptyCampaignLibrary(),
          pack("2026-09-07", "2026-11-17", "Incoming"),
          "b.pdf",
          "t2",
        ),
        "11",
        "2026-09-07",
        "2026-11-17",
        { hidden: [], preset, showDayCounts: true },
      ),
      "11",
      "Imported",
    );
    const merged = mergeStoresIntoLibrary(library, incoming, ["11"]);
    assert.equal(merged.stores["11"]?.settings.name, "Imported");
    assert.equal(merged.stores["11"]?.settings.showDayCounts, true);
    assert.equal(merged.stores["22"]?.settings.name, "Keep");
    assert.equal(merged.stores["22"]?.settings.compactList, true);
  });
});
