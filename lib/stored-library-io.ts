import {
  campaignKey,
  parseCampaignLibrary,
  type CampaignLibrary,
} from "./campaign-records";

export const STORED_LIBRARY_FORMAT_V2 = "dominos-shelf-life-stored-v2";
export const STORED_LIBRARY_FORMAT_V1 = "dominos-shelf-life-stored-v1";

export type StoredLibraryPayload = {
  format: typeof STORED_LIBRARY_FORMAT_V2 | typeof STORED_LIBRARY_FORMAT_V1;
  exportedAt: string;
  storeId?: string;
  library: CampaignLibrary;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

/** Keep only the given stores and the chart packs they reference. */
export function pickStoresFromLibrary(
  library: CampaignLibrary,
  storeIds: Iterable<string>,
): CampaignLibrary {
  const wanted = new Set(
    [...storeIds].map((id) => id.trim()).filter((id) => /^\d{1,8}$/.test(id)),
  );
  const stores: CampaignLibrary["stores"] = {};
  const neededKeys = new Set<string>();
  for (const storeId of wanted) {
    const store = library.stores[storeId];
    if (!store) continue;
    stores[storeId] = store;
    for (const key of Object.keys(store.campaigns)) neededKeys.add(key);
  }
  const campaigns = library.campaigns.filter((item) => {
    const key = campaignKey(item.issued, item.validUntil);
    return Boolean(key && neededKeys.has(key));
  });
  return { campaigns, stores };
}

/**
 * Overlay selected stores from `incoming` onto `current`.
 * Other device stores are kept. Charts for the chosen stores are upserted.
 */
export function mergeStoresIntoLibrary(
  current: CampaignLibrary,
  incoming: CampaignLibrary,
  storeIds: Iterable<string>,
): CampaignLibrary {
  const picked = pickStoresFromLibrary(incoming, storeIds);
  if (Object.keys(picked.stores).length === 0) return current;
  const byKey = new Map(
    current.campaigns.map((item) => [
      campaignKey(item.issued, item.validUntil) ?? "",
      item,
    ]),
  );
  for (const item of picked.campaigns) {
    const key = campaignKey(item.issued, item.validUntil);
    if (!key) continue;
    byKey.set(key, item);
  }
  return {
    campaigns: [...byKey.values()].filter((item) =>
      Boolean(campaignKey(item.issued, item.validUntil)),
    ),
    stores: {
      ...current.stores,
      ...picked.stores,
    },
  };
}

/** Build a downloadable backup of the device Stored data library. */
export function buildStoredLibraryPayload(
  library: CampaignLibrary,
  options: {
    storeId?: string;
    storeIds?: Iterable<string>;
    exportedAt?: string;
  } = {},
): StoredLibraryPayload {
  const storeIds = options.storeIds
    ? [...options.storeIds].map((id) => id.trim()).filter((id) => /^\d{1,8}$/.test(id))
    : null;
  const sliced =
    storeIds && storeIds.length > 0
      ? pickStoresFromLibrary(library, storeIds)
      : library;
  const storeId =
    typeof options.storeId === "string" && /^\d{1,8}$/.test(options.storeId)
      ? options.storeId
      : storeIds?.length === 1
        ? storeIds[0]
        : undefined;
  return {
    format: STORED_LIBRARY_FORMAT_V2,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    ...(storeId ? { storeId } : {}),
    library: sliced,
  };
}

/**
 * Accept wrapped v1/v2 payloads or a raw CampaignLibrary (legacy/new).
 * Always returns the normalized store-first library.
 */
export function parseStoredLibraryPayload(value: unknown): StoredLibraryPayload | null {
  if (!isRecord(value)) return null;

  const format =
    value.format === STORED_LIBRARY_FORMAT_V2 || value.format === STORED_LIBRARY_FORMAT_V1
      ? value.format
      : null;

  if (format) {
    const library = parseCampaignLibrary(value.library);
    const storeId =
      typeof value.storeId === "string" && /^\d{1,8}$/.test(value.storeId)
        ? value.storeId
        : undefined;
    const exportedAt =
      typeof value.exportedAt === "string" && value.exportedAt
        ? value.exportedAt
        : new Date().toISOString();
    return {
      format,
      exportedAt,
      ...(storeId ? { storeId } : {}),
      library,
    };
  }

  // Raw library JSON (with campaigns/charts + stores).
  if (Array.isArray(value.campaigns) || Array.isArray(value.charts) || isRecord(value.stores)) {
    return {
      format: STORED_LIBRARY_FORMAT_V2,
      exportedAt: new Date().toISOString(),
      library: parseCampaignLibrary(value),
    };
  }

  return null;
}

export function summarizeStoredLibrary(library: CampaignLibrary): {
  stores: number;
  campaigns: number;
  charts: number;
} {
  let campaigns = 0;
  for (const store of Object.values(library.stores)) {
    campaigns += Object.keys(store.campaigns).length;
  }
  return {
    stores: Object.keys(library.stores).length,
    campaigns,
    charts: library.campaigns.length,
  };
}
