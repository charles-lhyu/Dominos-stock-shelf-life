import {
  campaignKey,
  emptyCampaignLibrary,
  listCampaignSummaries,
  parseCampaignLibrary,
  planStoreChange,
  readStoreSettings,
  upsertCampaign,
  writeStoreSettings,
  type CampaignLibrary,
  type CampaignSummary,
  type StoreCampaignSettings,
} from "./campaign-records";
import {
  getDeskState,
  onPackCleared,
  onPackImported,
  setImportedPack,
} from "./desk-store";
import {
  clearHiddenNames,
  getHiddenNames,
  replaceHiddenNames,
  subscribeHidden,
} from "./hidden-store";
import {
  getItemPreset,
  replaceItemPreset,
  resetItemPreset,
  subscribeItemPreset,
} from "./item-preset-store";
import { getStoreId, hydrateStoreIdStore } from "./store-id-store";
import type { ChartPack } from "./types";

const STORAGE_KEY = "campaign-library-v1";
const EMPTY_CAMPAIGNS: CampaignSummary[] = [];

let library: CampaignLibrary = emptyCampaignLibrary();
let snapshot: CampaignSummary[] = EMPTY_CAMPAIGNS;
let hydrated = false;
let applying = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function refreshSnapshot() {
  const next = listCampaignSummaries(library);
  snapshot = next.length === 0 ? EMPTY_CAMPAIGNS : next;
}

function commitLibrary(next: CampaignLibrary) {
  if (next === library) return;
  library = next;
  refreshSnapshot();
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    }
  } catch {
    // Ignore quota / private mode.
  }
  emit();
}

export function hydrateCampaignLibrary() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) library = parseCampaignLibrary(JSON.parse(raw));
  } catch {
    library = emptyCampaignLibrary();
  }
  refreshSnapshot();
}

export function listCampaigns(): CampaignSummary[] {
  return snapshot;
}

export function listCampaignsServer(): CampaignSummary[] {
  return EMPTY_CAMPAIGNS;
}

export function subscribeCampaignLibrary(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function currentSettings(): StoreCampaignSettings {
  return {
    hidden: [...getHiddenNames()],
    preset: { ...getItemPreset() },
  };
}

function saveCurrent(storeId: string) {
  if (!storeId || applying) return;
  const desk = getDeskState();
  if (!desk.imported) return;
  const { issued, validUntil } = desk.pack.chart;
  commitLibrary(writeStoreSettings(library, storeId, issued, validUntil, currentSettings()));
}

function autosave() {
  if (applying) return;
  hydrateStoreIdStore();
  const storeId = getStoreId();
  if (!storeId) return;
  saveCurrent(storeId);
}

function applySettings(settings: StoreCampaignSettings) {
  applying = true;
  try {
    replaceHiddenNames(settings.hidden);
    replaceItemPreset(settings.preset);
  } finally {
    applying = false;
  }
}

function handleImportedPack(pack: ChartPack, sourceUrl: string) {
  hydrateCampaignLibrary();
  hydrateStoreIdStore();
  commitLibrary(upsertCampaign(library, pack, sourceUrl, new Date().toISOString()));
  const { issued, validUntil } = pack.chart;
  const storeId = getStoreId();
  const saved = storeId ? readStoreSettings(library, storeId, issued, validUntil) : null;
  applying = true;
  try {
    if (saved) {
      replaceHiddenNames(saved.hidden);
      replaceItemPreset(saved.preset);
    } else if (storeId && campaignKey(issued, validUntil)) {
      clearHiddenNames();
      resetItemPreset();
    } else {
      clearHiddenNames();
    }
  } finally {
    applying = false;
  }
  if (storeId && !saved) saveCurrent(storeId);
}

function handlePackCleared() {
  hydrateStoreIdStore();
  applying = true;
  try {
    clearHiddenNames();
    if (getStoreId()) resetItemPreset();
  } finally {
    applying = false;
  }
}

/** Remember the chart already on screen so Import data can load it again. */
export function captureActiveCampaign() {
  hydrateCampaignLibrary();
  hydrateStoreIdStore();
  const desk = getDeskState();
  if (!desk.imported) return;
  const { issued, validUntil } = desk.pack.chart;
  if (!campaignKey(issued, validUntil)) return;
  commitLibrary(upsertCampaign(library, desk.pack, desk.sourceUrl, new Date().toISOString()));
  const storeId = getStoreId();
  if (!storeId) return;
  if (!readStoreSettings(library, storeId, issued, validUntil)) saveCurrent(storeId);
}

/** Save the previous store, then load the new store's copy of this campaign. */
export function adoptStoreForCampaign(previousStoreId: string, nextStoreId: string) {
  hydrateCampaignLibrary();
  hydrateStoreIdStore();
  const desk = getDeskState();
  if (!desk.imported) return;
  const { issued, validUntil } = desk.pack.chart;
  if (!campaignKey(issued, validUntil)) return;
  const planned = planStoreChange({
    library,
    previousStoreId,
    nextStoreId,
    issued,
    validUntil,
    current: currentSettings(),
  });
  commitLibrary(planned.library);
  if (planned.restore) applySettings(planned.restore);
}

export function reloadCampaign(issued: string, validUntil: string) {
  hydrateCampaignLibrary();
  const key = campaignKey(issued, validUntil);
  if (!key) return;
  const record = library.campaigns.find(
    (item) => campaignKey(item.issued, item.validUntil) === key,
  );
  if (!record) return;
  setImportedPack(record.pack, record.sourceUrl);
}

onPackImported(handleImportedPack);
onPackCleared(handlePackCleared);
subscribeHidden(autosave);
subscribeItemPreset(autosave);
