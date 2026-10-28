import {
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

/** Build a downloadable backup of the device Stored data library. */
export function buildStoredLibraryPayload(
  library: CampaignLibrary,
  options: { storeId?: string; exportedAt?: string } = {},
): StoredLibraryPayload {
  const storeId =
    typeof options.storeId === "string" && /^\d{1,8}$/.test(options.storeId)
      ? options.storeId
      : undefined;
  return {
    format: STORED_LIBRARY_FORMAT_V2,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    ...(storeId ? { storeId } : {}),
    library,
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
