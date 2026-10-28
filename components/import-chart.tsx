"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Camera,
  FileText,
  ImageUp,
  Link2,
  Lock,
  QrCode,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Settings,
  Sun,
  Type,
  Unlock,
  X,
  ChevronDown,
} from "lucide-react";
import { ChangelogBrowser } from "@/components/changelog-notes";
import { UpdateConfirmDialog } from "@/components/update-confirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adoptStoreForCampaign,
  clearSavedDefaults,
  clearSavedHidden,
  forgetSavedDefault,
  forgetSavedHidden,
  hydrateCampaignLibrary,
  listCampaigns,
  listCampaignsServer,
  listStoredForStore,
  listStoredForStoreServer,
  listStoredOnDevice,
  listStoredOnDeviceServer,
  listStoreNames,
  listStoreNamesServer,
  readSavedCampaignSettings,
  reloadCampaign,
  setStoreName,
  subscribeCampaignLibrary,
  subscribeStoredStore,
} from "@/lib/campaign-library";
import { CHANGELOG } from "@/lib/changelog";
import { parseChartPack } from "@/lib/chart-pack";
import { formatCompactDate, formatLongDate, formatShortDate } from "@/lib/dates";
import {
  getCompactDateFormat,
  subscribeDateFormat,
} from "@/lib/date-format-store";
import { getCompactList, subscribeCompactList } from "@/lib/compact-list-store";
import {
  applyAcceptedStoreChanges,
  listStoreSettingChanges,
} from "@/lib/campaign-records";
import {
  readDebug,
  readDebugDays,
  subscribeDebug,
  writeDebug,
  writeDebugDays,
} from "@/lib/debug-store";
import {
  clearHiddenNames,
  getHiddenNames,
  getHiddenNamesServer,
  subscribeHidden,
  unhideProductName,
} from "@/lib/hidden-store";
import {
  clearImportedPack,
  setImportedPack,
  type DeskState,
} from "@/lib/desk-store";
import { clearPdfCrops, replacePdfCrops } from "@/lib/pdf-crop-images";
import { parsePdfChartFile } from "@/lib/pdf-chart";
import {
  clearProductDefaults,
  getItemPreset,
  getItemPresetServer,
  hydrateItemPresetStore,
  retainProductDefaults,
  setProductDefault,
  subscribeItemPreset,
  type ItemPreset,
} from "@/lib/item-preset-store";
import { prepClockTime, SECTION_TAG } from "@/lib/preview";
import {
  appVersionLabel,
  getAppUpdateInfo,
  reloadAppToLatest,
} from "@/lib/reload-app";
import { textConversionTable } from "@/lib/text-conversion";
import { fetchRemoteChart } from "@/lib/remote-chart";
import type { ChartPack } from "@/lib/types";
import {
  getKeepAwake,
  getKeepAwakeServer,
  hydrateKeepAwakeStore,
  setKeepAwake,
  subscribeKeepAwake,
} from "@/lib/keep-awake-store";
import {
  DEFAULT_ROTATION_PREF,
  getRotationPref,
  hydrateRotationStore,
  setPreferredOrientation,
  setRotationLocked,
  subscribeRotation,
} from "@/lib/rotation-store";
import {
  getStoreId,
  getStoreIdServer,
  hydrateStoreIdStore,
  normalizeStoreId,
  setStoreId,
  subscribeStoreId,
} from "@/lib/store-id-store";
import {
  getTextSize,
  getTextSizeServer,
  hydrateTextSizeStore,
  setTextSize,
  subscribeTextSize,
  TEXT_SIZE_OPTIONS,
} from "@/lib/text-size-store";
import { cn } from "cn";
import { toast } from "sonner";

type SettingsSectionId =
  | "settings-chart"
  | "settings-display"
  | "settings-debug"
  | "settings-app"
  | "settings-system";

const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  "settings-app",
  "settings-chart",
  "settings-display",
  "settings-debug",
  "settings-system",
];

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats: string[] }) => BarcodeDetectorLike;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

export function ImportChartButton({
  desk,
  open: openProp,
  onOpenChange,
  onOpenProduct,
  compact = false,
}: {
  desk: DeskState;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Close settings and show this product, including when it is hidden. */
  onOpenProduct?: (name: string) => void;
  /** Smaller trigger for the always-visible store bar. */
  compact?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [url, setUrl] = useState(desk.sourceUrl);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    localVersion: string;
    remoteVersion: string;
    notes: string[];
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [storeDraft, setStoreDraft] = useState("");
  const [storeIdError, setStoreIdError] = useState<string | null>(null);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [storeMenuAll, setStoreMenuAll] = useState(false);
  const [storePrompt, setStorePrompt] = useState<{ next: string; hasSaved: boolean } | null>(
    null,
  );
  const [changesOpen, setChangesOpen] = useState(false);
  const [changeChoices, setChangeChoices] = useState<string[]>([]);
  const [storedEditing, setStoredEditing] = useState(false);
  const [allStoredOpen, setAllStoredOpen] = useState(false);
  const [storeNameDraft, setStoreNameDraft] = useState<{ storeId: string; value: string } | null>(
    null,
  );
  const storePromptRef = useRef<string | null>(null);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("settings-app");
  const [settingsEndPad, setSettingsEndPad] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const settingsBodyRef = useRef<HTMLDivElement>(null);
  const settingsNavRef = useRef<HTMLDivElement>(null);
  const settingsJumpLock = useRef(false);
  const settingsJumpTimer = useRef<number | null>(null);
  const storeFieldRef = useRef<HTMLDivElement>(null);
  const debug = useSyncExternalStore(subscribeDebug, readDebug, () => false);
  const debugDays = useSyncExternalStore(
    subscribeDebug,
    readDebugDays,
    () => false,
  );
  const compactDates = useSyncExternalStore(
    subscribeDateFormat,
    getCompactDateFormat,
    () => false,
  );
  const compactList = useSyncExternalStore(subscribeCompactList, getCompactList, () => false);
  const hiddenNames = useSyncExternalStore(
    subscribeHidden,
    getHiddenNames,
    getHiddenNamesServer,
  );
  const itemPreset = useSyncExternalStore(
    subscribeItemPreset,
    () => {
      hydrateItemPresetStore();
      return getItemPreset();
    },
    getItemPresetServer,
  );
  const rotation = useSyncExternalStore(
    subscribeRotation,
    () => {
      hydrateRotationStore();
      return getRotationPref();
    },
    () => DEFAULT_ROTATION_PREF,
  );
  const keepAwake = useSyncExternalStore(
    subscribeKeepAwake,
    () => {
      hydrateKeepAwakeStore();
      return getKeepAwake();
    },
    getKeepAwakeServer,
  );
  const textSize = useSyncExternalStore(
    subscribeTextSize,
    () => {
      hydrateTextSizeStore();
      return getTextSize();
    },
    getTextSizeServer,
  );
  const storeId = useSyncExternalStore(
    subscribeStoreId,
    () => {
      hydrateStoreIdStore();
      return getStoreId();
    },
    getStoreIdServer,
  );
  const campaigns = useSyncExternalStore(
    subscribeCampaignLibrary,
    () => {
      hydrateCampaignLibrary();
      return listCampaigns();
    },
    listCampaignsServer,
  );
  const storedForStore = useSyncExternalStore(
    subscribeStoredStore,
    () => {
      hydrateCampaignLibrary();
      hydrateStoreIdStore();
      return listStoredForStore(getStoreId());
    },
    listStoredForStoreServer,
  );
  const deviceStored = useSyncExternalStore(
    subscribeCampaignLibrary,
    () => {
      hydrateCampaignLibrary();
      return listStoredOnDevice();
    },
    listStoredOnDeviceServer,
  );
  const storeNames = useSyncExternalStore(
    subscribeCampaignLibrary,
    () => {
      hydrateCampaignLibrary();
      return listStoreNames();
    },
    listStoreNamesServer,
  );

  useEffect(() => () => stopScan(), []);

  useEffect(() => {
    if (!open) return;
    hydrateStoreIdStore();
    setStoreDraft(getStoreId());
    setStoreIdError(null);
    setStoreMenuOpen(false);
    setStoreMenuAll(false);
    setStoredEditing(false);
    setStoreNameDraft(null);
    setActiveSettingsSection("settings-app");
    const raf = window.requestAnimationFrame(() => {
      settingsBodyRef.current?.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!storeMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const field = storeFieldRef.current;
      if (!field || !(event.target instanceof Node) || field.contains(event.target)) return;
      setStoreMenuOpen(false);
      setStoreMenuAll(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [storeMenuOpen]);

  function handleOpenChange(next: boolean) {
    if (!next && storePromptRef.current) return;
    if (next) {
      hydrateStoreIdStore();
      setStoreDraft(getStoreId());
      setStoreIdError(null);
      setStoreMenuOpen(false);
      setStoreMenuAll(false);
      setUrl(desk.sourceUrl);
      setConfirmReset(false);
      setChangelogOpen(false);
      setUpdateConfirmOpen(false);
      setActiveSettingsSection("settings-app");
    } else {
      stopScan();
      setConfirmReset(false);
      setChangelogOpen(false);
      setUpdateConfirmOpen(false);
      if (settingsJumpTimer.current != null) {
        window.clearTimeout(settingsJumpTimer.current);
        settingsJumpTimer.current = null;
      }
      settingsJumpLock.current = false;
      storePromptRef.current = null;
      setStorePrompt(null);
      setChangesOpen(false);
      setChangeChoices([]);
      setStoreDraft(getStoreId());
      setStoredEditing(false);
      setStoreNameDraft(null);
      setAllStoredOpen(false);
      setStoreMenuOpen(false);
      setStoreMenuAll(false);
    }
    setOpen(next);
  }

  function applyStoreChange(previous: string, next: string, keepCurrent?: boolean) {
    setStoreId(next);
    setStoreDraft(next);
    adoptStoreForCampaign(previous, next, keepCurrent);
  }

  function closeStorePrompt() {
    storePromptRef.current = null;
    setStorePrompt(null);
    setChangesOpen(false);
    setChangeChoices([]);
  }

  function cancelStorePrompt() {
    if (!storePromptRef.current) return;
    closeStorePrompt();
    setStoreDraft(getStoreId());
  }

  function confirmStorePrompt(keepCurrent: boolean) {
    const next = storePromptRef.current;
    if (!next) return;
    const previous = getStoreId();
    closeStorePrompt();
    applyStoreChange(previous, next, keepCurrent);
  }

  function acceptSelectedChanges() {
    const next = storePromptRef.current;
    if (!next || !desk.imported || changeChoices.length === 0) return;
    const previous = getStoreId();
    const saved = readSavedCampaignSettings(
      next,
      desk.pack.chart.issued,
      desk.pack.chart.validUntil,
    );
    const merged = applyAcceptedStoreChanges(
      {
        hidden: [...getHiddenNames()],
        preset: getItemPreset(),
        compactDates: getCompactDateFormat(),
        showDayCounts: readDebugDays(),
        compactList: getCompactList(),
      },
      saved,
      changeChoices,
    );
    closeStorePrompt();
    setStoreId(next);
    setStoreDraft(next);
    adoptStoreForCampaign(previous, next, undefined, merged);
  }

  function commitStoreDraft() {
    setStoreMenuOpen(false);
    setStoreMenuAll(false);
    const next = normalizeStoreId(storeDraft);
    if (next == null) {
      setStoreIdError("Store ID is numbers only, up to 8 digits.");
      return;
    }
    setStoreIdError(null);
    const previous = getStoreId();
    if (next === previous) {
      setStoreDraft(next);
      return;
    }
    if (!next || !desk.imported || storePromptRef.current === next) {
      if (storePromptRef.current === next) return;
      applyStoreChange(previous, next);
      return;
    }
    hydrateCampaignLibrary();
    hydrateItemPresetStore();
    const saved = readSavedCampaignSettings(
      next,
      desk.pack.chart.issued,
      desk.pack.chart.validUntil,
    );
    const screenHas =
      getHiddenNames().length > 0 ||
      Object.keys(getItemPreset().defaults).length > 0 ||
      getCompactDateFormat() ||
      readDebugDays() ||
      getCompactList();
    if (!screenHas && !saved) {
      applyStoreChange(previous, next);
      return;
    }
    // An existing store loads its saved copy; only ask when that store has none.
    if (saved) {
      applyStoreChange(previous, next, false);
      return;
    }
    storePromptRef.current = next;
    setStoreDraft(next);
    setChangesOpen(false);
    setChangeChoices([]);
    setStorePrompt({ next, hasSaved: false });
  }

  function resetChart() {
    void clearPdfCrops();
    clearImportedPack();
    setUrl("");
    setConfirmReset(false);
    toast.success("Chart cleared.");
  }

  function stopScan() {
    if (scanTimer.current != null) {
      window.clearInterval(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }

  async function commitPack(
    pack: ChartPack,
    source: string,
    crops?: Record<string, string>,
  ) {
    if (crops && Object.keys(crops).length > 0) {
      await replacePdfCrops(crops);
    } else {
      await clearPdfCrops();
    }
    setImportedPack(pack, source);
    stopScan();
    const count = pack.rules.length;
    toast.success(
      count === 1 ? "Imported 1 item" : `Imported ${count} items`,
    );
    setOpen(false);
  }

  async function applyPack(pack: Awaited<ReturnType<typeof parseChartPack>>, source: string) {
    if (!pack.ok) {
      toast.error(pack.error);
      return;
    }
    await commitPack(pack.pack, source);
  }

  async function importFromUrl(nextUrl: string) {
    setBusy(true);
    const result = await fetchRemoteChart(nextUrl);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setUrl(nextUrl.trim());
    await commitPack(result.pack, nextUrl.trim(), result.crops);
  }

  async function importFromText(raw: string, source: string) {
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("{")) {
      await importFromUrl(trimmed);
      return;
    }
    try {
      await applyPack(parseChartPack(JSON.parse(trimmed)), source);
    } catch {
      toast.error("That file is not valid chart JSON.");
    }
  }

  async function readQrFromImage(file: File) {
    setBusy(true);
    try {
      if (!window.BarcodeDetector) {
        toast.error(
          "This phone browser cannot read QR codes from photos. Try a file or URL.",
        );
        return;
      }
      const bitmap = await createImageBitmap(file);
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(bitmap);
      bitmap.close();
      const value = codes[0]?.rawValue?.trim();
      if (!value) {
        toast.error("No QR code found in that picture.");
        return;
      }
      if (/^https?:\/\//i.test(value)) {
        setUrl(value);
        await importFromUrl(value);
      } else {
        await importFromText(value, "photo-qr");
      }
    } catch {
      toast.error("Could not read that picture.");
    } finally {
      setBusy(false);
    }
  }

  async function startScan() {
    if (!window.BarcodeDetector) {
      toast.error(
        "Live QR scanning is not supported here. Use a photo, file, or URL.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      scanTimer.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue?.trim();
          if (!value) return;
          stopScan();
          if (/^https?:\/\//i.test(value)) {
            setUrl(value);
            await importFromUrl(value);
          } else {
            await importFromText(value, "live-qr");
          }
        } catch {
          // Keep scanning.
        }
      }, 450);
    } catch {
      toast.error("Camera permission was blocked.");
      stopScan();
    }
  }

  const settingsNav = [
    { id: "settings-app" as const, label: "App" },
    { id: "settings-chart" as const, label: "Import" },
    { id: "settings-display" as const, label: "Display" },
    { id: "settings-debug" as const, label: "Debug" },
    { id: "settings-system" as const, label: "System" },
  ];

  const activeSettingsLabel =
    settingsNav.find((item) => item.id === activeSettingsSection)?.label ??
    "App";

  const settingsSelectLabels = Object.fromEntries(
    settingsNav.map((item) => [item.id, item.label]),
  );
  const storedStoreIds = [...new Set(deviceStored.map((item) => item.storeId))];
  const storeQuery = storeDraft.trim().replace(/\s+/g, "");
  const menuStoreIds =
    storeMenuAll || !storeQuery
      ? storedStoreIds
      : storedStoreIds.filter((id) => id.startsWith(storeQuery));
  const draftStoreId = normalizeStoreId(storeDraft);
  const previewStoreId = draftStoreId && draftStoreId !== storeId ? draftStoreId : null;
  const previewRows = previewStoreId
    ? deviceStored.filter((item) => item.storeId === previewStoreId)
    : [];
  const storeMenuVisible = storeMenuOpen && menuStoreIds.length > 0;
  const storeChanges =
    storePrompt && desk.imported
      ? listStoreSettingChanges(
          {
            hidden: hiddenNames,
            preset: itemPreset,
            compactDates,
            showDayCounts: debugDays,
            compactList,
          },
          readSavedCampaignSettings(
            storePrompt.next,
            desk.pack.chart.issued,
            desk.pack.chart.validUntil,
          ),
        )
      : [];
  const allChangesSelected =
    storeChanges.length > 0 &&
    storeChanges.every((change) => changeChoices.includes(change.id));

  function chartOnScreen(issued: string, validUntil: string) {
    return (
      desk.imported &&
      desk.pack.chart.issued === issued &&
      desk.pack.chart.validUntil === validUntil
    );
  }

  function withLiveSettings<T extends { hidden: string[]; preset: ItemPreset }>(item: T): T {
    return {
      ...item,
      hidden: hiddenNames,
      compactDates,
      showDayCounts: debugDays,
      compactList,
      preset: {
        ...itemPreset,
        defaults: retainProductDefaults(itemPreset.defaults, desk.pack.rules, hiddenNames),
      },
    };
  }

  const savedRows = storedForStore.map((item) =>
    chartOnScreen(item.issued, item.validUntil) ? withLiveSettings(item) : item,
  );
  const storedRows =
    storeId &&
    desk.imported &&
    desk.pack.chart.issued &&
    desk.pack.chart.validUntil &&
    !savedRows.some((item) => chartOnScreen(item.issued, item.validUntil))
      ? [
          withLiveSettings({
            issued: desk.pack.chart.issued,
            validUntil: desk.pack.chart.validUntil,
            title: desk.pack.chart.title || "Shelf life chart",
            hidden: hiddenNames,
            preset: itemPreset,
          }),
          ...savedRows,
        ]
      : savedRows;
  function nameFor(id: string) {
    if (storeNameDraft?.storeId === id) return storeNameDraft.value;
    return storeNames[id] ?? "";
  }

  function changeStoreName(id: string, value: string) {
    setStoreNameDraft({ storeId: id, value: value.slice(0, 48) });
    setStoreName(id, value);
  }

  function toggleStoredEditing() {
    setStoredEditing((on) => {
      if (on) setStoreNameDraft(null);
      return !on;
    });
  }

  function openStoredProduct(name: string, issued: string, validUntil: string) {
    if (!onOpenProduct) return;
    if (!chartOnScreen(issued, validUntil)) reloadCampaign(issued, validUntil);
    onOpenProduct(name);
  }

  function removeHidden(
    targetStoreId: string,
    issued: string,
    validUntil: string,
    name: string,
    onScreen: boolean,
  ) {
    if (onScreen) {
      unhideProductName(name);
      return;
    }
    forgetSavedHidden(targetStoreId, issued, validUntil, name);
  }

  function removeDefault(
    targetStoreId: string,
    issued: string,
    validUntil: string,
    name: string,
    onScreen: boolean,
  ) {
    if (onScreen) {
      setProductDefault(name, { section: null, life: null });
      return;
    }
    forgetSavedDefault(targetStoreId, issued, validUntil, name);
  }

  function removeAllHidden(
    targetStoreId: string,
    issued: string,
    validUntil: string,
    onScreen: boolean,
  ) {
    if (onScreen) {
      clearHiddenNames();
      return;
    }
    clearSavedHidden(targetStoreId, issued, validUntil);
  }

  function removeAllDefaults(
    targetStoreId: string,
    issued: string,
    validUntil: string,
    onScreen: boolean,
  ) {
    if (onScreen) {
      clearProductDefaults();
      return;
    }
    clearSavedDefaults(targetStoreId, issued, validUntil);
  }

  function syncNavCard(id: SettingsSectionId) {
    const nav = settingsNavRef.current;
    if (!nav) return;
    // App is the first chip. Centering it cannot scroll back to the start,
    // and a smooth scroll still in flight from the section below leaves the row offset.
    if (id === SETTINGS_SECTION_IDS[0]) {
      if (nav.scrollLeft <= 1) return;
      nav.scrollTo({ left: 0, behavior: "auto" });
      return;
    }
    const chip = nav.querySelector<HTMLElement>(
      `button[data-settings-nav="${id}"]`,
    );
    if (!chip) return;
    const navRect = nav.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const delta =
      chipRect.left +
      chipRect.width / 2 -
      (navRect.left + navRect.width / 2);
    if (Math.abs(delta) < 2) return;
    nav.scrollBy({ left: delta, behavior: "smooth" });
  }

  function sectionAtScroll(body: HTMLElement): SettingsSectionId {
    const bodyRect = body.getBoundingClientRect();
    // Active section = the one whose top has crossed a line near the top of the pane.
    const marker = bodyRect.top + Math.min(56, bodyRect.height * 0.25);
    let current: SettingsSectionId = SETTINGS_SECTION_IDS[0];
    let bestTop = Number.NEGATIVE_INFINITY;
    for (const id of SETTINGS_SECTION_IDS) {
      const el = body.querySelector<HTMLElement>(`#${id}`);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= marker && top >= bestTop) {
        bestTop = top;
        current = id;
      }
    }
    return current;
  }

  function applyActiveSection(id: SettingsSectionId) {
    setActiveSettingsSection((prev) => {
      if (prev === id) return prev;
      requestAnimationFrame(() => syncNavCard(id));
      return id;
    });
  }

  function jumpToSection(id: SettingsSectionId) {
    const body = settingsBodyRef.current;
    const target = body?.querySelector<HTMLElement>(`#${id}`);
    if (!body || !target) return;
    settingsJumpLock.current = true;
    applyActiveSection(id);
    syncNavCard(id);
    const top =
      target.getBoundingClientRect().top -
      body.getBoundingClientRect().top +
      body.scrollTop;
    body.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    if (settingsJumpTimer.current != null) {
      window.clearTimeout(settingsJumpTimer.current);
    }
    settingsJumpTimer.current = window.setTimeout(() => {
      settingsJumpLock.current = false;
      settingsJumpTimer.current = null;
      applyActiveSection(sectionAtScroll(body));
    }, 650);
  }

  function measureSettingsEndPad(body: HTMLElement): number {
    const last = body.querySelector<HTMLElement>("#settings-system");
    if (!last || body.clientHeight <= 0) return 0;
    // Pane is a fixed viewport — pad so System's top can sit at the pane top.
    return Math.max(0, Math.round(body.clientHeight - last.offsetHeight));
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let body: HTMLDivElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    function syncEndPad() {
      if (!body) return;
      const next = measureSettingsEndPad(body);
      setSettingsEndPad((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    }

    function onScroll() {
      if (!body || settingsJumpLock.current) return;
      applyActiveSection(sectionAtScroll(body));
    }

    function attach() {
      if (cancelled) return false;
      body = settingsBodyRef.current;
      if (!body) return false;
      body.addEventListener("scroll", onScroll, { passive: true });
      resizeObserver = new ResizeObserver(() => {
        syncEndPad();
        onScroll();
      });
      resizeObserver.observe(body);
      const system = body.querySelector("#settings-system");
      if (system) resizeObserver.observe(system);
      syncEndPad();
      requestAnimationFrame(() => {
        if (!cancelled) syncEndPad();
      });
      onScroll();
      return true;
    }

    let retryTimer: number | null = null;
    const raf = window.requestAnimationFrame(() => {
      if (attach()) return;
      retryTimer = window.setTimeout(() => {
        attach();
      }, 80);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      if (retryTimer != null) window.clearTimeout(retryTimer);
      resizeObserver?.disconnect();
      body?.removeEventListener("scroll", onScroll);
    };
  }, [open, hiddenNames.length, debug, desk.imported, desk.pack.rules.length]);

  useLayoutEffect(() => {
    if (!open) return;
    const body = settingsBodyRef.current;
    if (!body) return;
    const next = measureSettingsEndPad(body);
    if (Math.abs(settingsEndPad - next) >= 1) setSettingsEndPad(next);
  }, [open, settingsEndPad, debug, desk.imported, desk.pack.rules.length]);

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/25",
              compact ? "size-8" : "size-11",
            )}
            aria-label="Settings"
          />
        }
      >
        <Settings className={compact ? "size-4" : "size-5"} />
      </DialogTrigger>
      <DialogContent
        className="top-[max(0.5rem,env(safe-area-inset-top))]! flex h-[calc(100dvh-max(0.5rem,env(safe-area-inset-top))-0.5rem)] max-h-[calc(100dvh-max(0.5rem,env(safe-area-inset-top))-0.5rem)] w-[calc(100%-1.25rem)] max-w-md translate-y-0! flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-white/10 px-4 py-3 pr-14">
          <DialogTitle className="font-display text-2xl text-white">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Store, import, display, debug, and system.
          </DialogDescription>
          <button
            type="button"
            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </DialogHeader>

        <nav
          aria-label="Settings sections"
          className="shrink-0 border-b border-white/10 bg-popover px-3 py-2.5"
        >
          <div
            ref={settingsNavRef}
            className="flex items-center gap-2 overflow-x-auto scroll-px-2 px-0.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-popover pr-0.5">
              <Select
                value={activeSettingsSection}
                items={settingsSelectLabels}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    jumpToSection(value as SettingsSectionId);
                  }
                }}
              >
                <SelectTrigger
                  aria-label={`Current section: ${activeSettingsLabel}`}
                  className="h-auto max-w-[9.5rem] gap-1 rounded-xl border-sky-400/50 bg-sky-500/20 px-3.5 py-2 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.25)] hover:bg-sky-500/25 focus-visible:border-sky-400/60 focus-visible:ring-sky-400/30 data-popup-open:relative data-popup-open:z-[101] data-popup-open:rounded-b-none data-popup-open:border-b-0 data-popup-open:shadow-none dark:bg-sky-500/20 dark:hover:bg-sky-500/25 [&_svg]:size-3.5 [&_svg]:text-sky-300 data-popup-open:[&_svg]:rotate-180 [&_[data-slot=select-value]]:text-[0.65rem] [&_[data-slot=select-value]]:font-semibold [&_[data-slot=select-value]]:tracking-[0.14em] [&_[data-slot=select-value]]:uppercase"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  sideOffset={0}
                  alignItemWithTrigger={false}
                  className="w-max min-w-(--anchor-width) rounded-t-none rounded-b-xl border-sky-400/50 border-t-0 bg-popover p-1 shadow-[0_0_0_1px_rgba(56,189,248,0.25)] ring-0"
                >
                  {settingsNav.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={item.id}
                      className="text-[0.7rem] font-semibold tracking-[0.12em] uppercase"
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span
                aria-hidden
                className="h-5 w-px shrink-0 bg-white/15"
              />
            </div>
            {settingsNav.map((item) => {
              const selected = activeSettingsSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-settings-nav={item.id}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => jumpToSection(item.id)}
                  className={cn(
                    "shrink-0 rounded-xl border px-3.5 py-2 text-left transition-[background-color,border-color,box-shadow,color] duration-200",
                    selected
                      ? "border-sky-400/50 bg-sky-500/20 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.25)]"
                      : "border-white/10 bg-card text-stone-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-stone-200",
                  )}
                >
                  <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.14em]">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div
          ref={settingsBodyRef}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-0"
        >
          <div className="flex flex-col gap-3">
          <section
            id="settings-app"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-app"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>App</SettingsSectionTitle>
            <div className="space-y-2">
              <label htmlFor="store-id" className="text-sm font-medium text-stone-300">
                Store ID
              </label>
              <div className={cn("flex gap-2", storeMenuVisible && "relative z-20")}>
                <div ref={storeFieldRef} className="relative min-w-0 flex-1">
                  <Input
                    id="store-id"
                    inputMode="numeric"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={12}
                    placeholder={storeId || "12345"}
                    value={storeDraft}
                    aria-invalid={storeIdError ? true : undefined}
                    aria-expanded={storedStoreIds.length > 0 ? storeMenuOpen : undefined}
                    aria-controls={storeMenuVisible ? "store-id-list" : undefined}
                    aria-autocomplete={storedStoreIds.length > 0 ? "list" : undefined}
                    onChange={(event) => {
                      setStoreDraft(event.target.value);
                      setStoreMenuAll(false);
                      if (storeIdError) setStoreIdError(null);
                      if (storedStoreIds.length > 0) setStoreMenuOpen(true);
                    }}
                    onFocus={() => {
                      if (storedStoreIds.length > 0) setStoreMenuOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && storeMenuOpen) {
                        event.preventDefault();
                        setStoreMenuOpen(false);
                        setStoreMenuAll(false);
                        return;
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitStoreDraft();
                      }
                    }}
                    className={cn(
                      "h-12 rounded-xl border-white/10 bg-black/30 text-base text-white placeholder:text-stone-500",
                      storedStoreIds.length > 0 && "pr-11",
                      storeMenuVisible && "rounded-b-none",
                    )}
                  />
                  {storedStoreIds.length > 0 ? (
                    <button
                      type="button"
                      aria-label="Show stored store IDs"
                      aria-expanded={storeMenuOpen}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (storeMenuOpen && storeMenuAll) {
                          setStoreMenuOpen(false);
                          setStoreMenuAll(false);
                          return;
                        }
                        setStoreMenuAll(true);
                        setStoreMenuOpen(true);
                      }}
                      className="absolute top-1/2 right-1.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-stone-300"
                    >
                      <ChevronDown
                        className={cn("size-4 transition-transform", storeMenuOpen && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                  ) : null}
                  {storeMenuVisible ? (
                    <ul
                      id="store-id-list"
                      role="listbox"
                      aria-label="Stored store IDs"
                      className="absolute top-full right-0 left-0 z-30 max-h-60 overflow-y-auto rounded-b-xl border border-t-0 border-white/10 bg-popover py-1 shadow-lg shadow-black/40"
                    >
                      {menuStoreIds.map((id) => {
                        const selected = id === storeDraft;
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setStoreDraft(id);
                                setStoreIdError(null);
                                setStoreMenuOpen(false);
                                setStoreMenuAll(false);
                              }}
                              className={cn(
                                "flex h-11 w-full items-center gap-2 px-3 text-left text-base text-white",
                                selected ? "bg-sky-500/20" : "hover:bg-white/[0.06]",
                              )}
                            >
                              <span className="shrink-0 font-mono">{id}</span>
                              {storeNames[id] ? (
                                <span className="min-w-0 truncate text-sm text-stone-300">
                                  {storeNames[id]}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
                <Button
                  type="button"
                  className="h-12 shrink-0 rounded-xl px-3"
                  disabled={normalizeStoreId(storeDraft) === storeId || storePrompt != null}
                  onClick={commitStoreDraft}
                >
                  Confirm
                </Button>
              </div>
              <p className={cn("text-xs", storeIdError ? "text-red-300" : "text-stone-500")}>
                {storeIdError
                  ? storeIdError
                  : storeId
                    ? `Store ${storeId}. Confirm loads the date display, hidden items, and product defaults saved for a store on this device.`
                    : "Number for this store. Load a stored store, then confirm."}
              </p>
            </div>
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="text-sm font-medium text-stone-300">Stored data</p>
                  {deviceStored.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAllStoredOpen(true)}
                      className="shrink-0 text-xs font-semibold text-sky-300 underline-offset-2 hover:underline"
                    >
                      Show all
                    </button>
                  ) : null}
                </div>
                {previewStoreId ?? storeId ? (
                  <StoredEditButton editing={storedEditing} onToggle={toggleStoredEditing} />
                ) : null}
              </div>
              {previewStoreId ?? storeId ? (
                storedEditing ? (
                  <StoreNameField
                    value={nameFor(previewStoreId ?? storeId)}
                    onChange={(value) => changeStoreName(previewStoreId ?? storeId, value)}
                  />
                ) : (
                  <div className="space-y-0.5 px-0.5">
                    <p className="text-xs text-stone-500">Store name</p>
                    <p className="truncate text-sm text-stone-200">
                      {nameFor(previewStoreId ?? storeId) || "Not set"}
                    </p>
                  </div>
                )
              ) : null}
              {!(previewStoreId ?? storeId) ? (
                <p className="text-xs text-stone-500">
                  Set a store ID to see the hidden items and product defaults saved for it.
                </p>
              ) : (previewStoreId ? previewRows : storedRows).length === 0 ? (
                <p className="text-xs text-stone-500">
                  Nothing saved for store {previewStoreId ?? storeId} yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {(previewStoreId ? previewRows : storedRows).map((item) => {
                    const onScreen = !previewStoreId && chartOnScreen(item.issued, item.validUntil);
                    return (
                      <article
                        key={`${item.issued}|${item.validUntil}`}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium text-white">
                            {item.title}
                          </p>
                          {onScreen ? (
                            <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-300">
                              On screen
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-stone-400">
                          Issued {formatShortDate(item.issued)} · Valid until{" "}
                          {formatShortDate(item.validUntil)}
                        </p>
                        <StoredCampaignDetails
                          item={item}
                          editing={storedEditing}
                          onOpenHidden={(name) =>
                            openStoredProduct(name, item.issued, item.validUntil)
                          }
                          onRemoveHidden={(name) =>
                            removeHidden(
                              previewStoreId ?? storeId,
                              item.issued,
                              item.validUntil,
                              name,
                              onScreen,
                            )
                          }
                          onRemoveDefault={(name) =>
                            removeDefault(
                              previewStoreId ?? storeId,
                              item.issued,
                              item.validUntil,
                              name,
                              onScreen,
                            )
                          }
                          onRemoveAllHidden={() =>
                            removeAllHidden(
                              previewStoreId ?? storeId,
                              item.issued,
                              item.validUntil,
                              onScreen,
                            )
                          }
                          onRemoveAllDefaults={() =>
                            removeAllDefaults(
                              previewStoreId ?? storeId,
                              item.issued,
                              item.validUntil,
                              onScreen,
                            )
                          }
                        />
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          <section
            id="settings-chart"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-chart"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>Import</SettingsSectionTitle>
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-300">Saved charts</p>
              {campaigns.length === 0 ? (
                <p className="text-xs text-stone-500">
                  Imported charts are kept here with their issued and valid dates.
                </p>
              ) : (
                <div className="space-y-2">
                  {campaigns.map((item) => {
                    const loaded =
                      desk.imported &&
                      desk.pack.chart.issued === item.issued &&
                      desk.pack.chart.validUntil === item.validUntil;
                    const issuedLabel = formatShortDate(item.issued);
                    const validLabel = formatShortDate(item.validUntil);
                    return (
                      <button
                        key={`${item.issued}|${item.validUntil}`}
                        type="button"
                        aria-pressed={loaded}
                        aria-label={`${item.title || "Shelf life chart"}, issued ${issuedLabel}, valid until ${validLabel}${loaded ? ", loaded" : ""}`}
                        disabled={busy}
                        onClick={() => reloadCampaign(item.issued, item.validUntil)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2.5 text-left",
                          loaded
                            ? "border-sky-400/50 bg-sky-500/15"
                            : "border-white/10 bg-black/20 hover:border-white/20",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-white">
                            {item.title || "Shelf life chart"}
                          </span>
                          {loaded ? (
                            <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-300">
                              Loaded
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-stone-400">
                          Issued {issuedLabel} · Valid until {validLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void readQrFromImage(file);
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                try {
                  const result = await parsePdfChartFile(file);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  await commitPack(result.pack, file.name, result.crops);
                } catch {
                  toast.error("Could not read that PDF.");
                } finally {
                  setBusy(false);
                }
              }}
            />

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-xl border-white/10 text-sm text-white"
                disabled={busy}
                onClick={() => photoRef.current?.click()}
              >
                <ImageUp className="size-4" />
                Camera
              </Button>
              {!scanning ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 justify-start rounded-xl border-white/10 text-sm text-white"
                  disabled={busy}
                  onClick={startScan}
                >
                  <QrCode className="size-4" />
                  Scan QR
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 justify-start rounded-xl border-white/10 text-sm text-white"
                  onClick={stopScan}
                >
                  <Camera className="size-4" />
                  Stop cam
                </Button>
              )}
            </div>

            {scanning ? (
              <div className="overflow-hidden rounded-2xl bg-black">
                <video
                  ref={videoRef}
                  className="aspect-[3/4] w-full object-cover"
                  muted
                  playsInline
                />
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <FileText className="size-4" />
              PDF chart
            </Button>

            <div className="space-y-2">
              <label htmlFor="chart-url" className="text-sm font-medium text-stone-300">
                Google Drive link
              </label>
              <div className="flex gap-2">
                <Input
                  id="chart-url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="https://drive.google.com/file/d/…"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="h-12 rounded-xl border-white/10 bg-black/30 text-base text-white placeholder:text-stone-500"
                />
                <Button
                  type="button"
                  className="h-12 shrink-0 rounded-xl px-3"
                  disabled={busy || !url.trim()}
                  onClick={() => importFromUrl(url)}
                >
                  <Link2 className="size-4" />
                  Load
                </Button>
              </div>
              <p className="text-xs text-stone-500">
                Share the PDF as “Anyone with the link”, then paste that link or put it
                in a QR code.
              </p>
            </div>

            {desk.imported ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw className="size-4" />
                Reset chart
              </Button>
            ) : null}
          </section>

          <section
            id="settings-display"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-display"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>Display</SettingsSectionTitle>
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-400">
                <Type className="size-3.5 opacity-80" aria-hidden />
                Text size
              </p>
              <div
                role="group"
                aria-label="Text size"
                className="grid grid-cols-3 gap-2"
              >
                {TEXT_SIZE_OPTIONS.map(({ id, label }) => {
                  const active = textSize === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTextSize(id)}
                      className={cn(
                        "flex h-12 flex-col items-center justify-center rounded-xl border font-medium text-white",
                        id === "sm" && "text-xs",
                        id === "md" && "text-sm",
                        id === "lg" && "text-base",
                        active
                          ? "border-sky-400/50 bg-sky-500/20"
                          : "border-white/10 bg-card text-stone-300",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-stone-500">
                Scales product names, dates, and chips on the desk.
              </p>
            </div>
            <div
              role="group"
              aria-label="Preferred orientation"
              className="grid grid-cols-2 gap-2"
            >
              {(
                [
                  {
                    id: "portrait" as const,
                    label: "Portrait",
                    Icon: RectangleVertical,
                  },
                  {
                    id: "landscape" as const,
                    label: "Landscape",
                    Icon: RectangleHorizontal,
                  },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = rotation.orientation === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPreferredOrientation(id)}
                    className={cn(
                      "flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium text-white",
                      active
                        ? "border-sky-400/50 bg-sky-500/20"
                        : "border-white/10 bg-card text-stone-300",
                    )}
                  >
                    <Icon className="size-4 opacity-80" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={rotation.locked}
              aria-label={
                rotation.locked
                  ? `Unlock ${rotation.orientation} view`
                  : `Lock to ${rotation.orientation} view`
              }
              onClick={() => setRotationLocked(!rotation.locked)}
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base text-white",
                rotation.locked
                  ? "border-emerald-400/40 bg-emerald-500/15"
                  : "border-white/10 bg-card",
              )}
            >
              <span className="inline-flex items-center gap-2">
                {rotation.locked ? (
                  <Lock className="size-4 opacity-80" aria-hidden />
                ) : (
                  <Unlock className="size-4 opacity-80" aria-hidden />
                )}
                {rotation.locked ? "Locked to view" : "Lock to this view"}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  rotation.locked ? "text-emerald-300" : "text-stone-500",
                )}
              >
                {rotation.locked ? "On" : "Off"}
              </span>
            </button>
            <p className="text-xs text-stone-500">
              Pick portrait or landscape, then lock so phones stay in that view. Wide
              desktops never rotate.
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={keepAwake}
              aria-label={
                keepAwake ? "Allow the screen to sleep" : "Keep the screen on"
              }
              onClick={() => setKeepAwake(!keepAwake)}
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base text-white",
                keepAwake
                  ? "border-emerald-400/40 bg-emerald-500/15"
                  : "border-white/10 bg-card",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Sun className="size-4 opacity-80" aria-hidden />
                Keep screen on
              </span>
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  keepAwake ? "text-emerald-300" : "text-stone-500",
                )}
              >
                {keepAwake ? "On" : "Off"}
              </span>
            </button>
            <p className="text-xs text-stone-500">
              Stops the phone sleeping while this tab is open. Turn off to save
              battery. Needs a modern browser (Chrome / Edge / installed app).
            </p>
          </section>

          <section
            id="settings-debug"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-debug"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>Debug</SettingsSectionTitle>
            <button
              type="button"
              role="switch"
              aria-checked={debugDays}
              aria-label="Show number of days instead of expiry dates"
              onClick={() => writeDebugDays(!debugDays)}
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base text-white",
                debugDays
                  ? "border-sky-400/40 bg-sky-500/15"
                  : "border-white/10 bg-card",
              )}
            >
              <span>Show days/hours instead of dates</span>
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  debugDays ? "text-sky-300" : "text-stone-500",
                )}
              >
                {debugDays ? "On" : "Off"}
              </span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={debug}
              aria-label="Show text conversion table"
              onClick={() => writeDebug(!debug)}
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base text-white",
                debug ? "border-sky-400/40 bg-sky-500/15" : "border-white/10 bg-card",
              )}
            >
              <span>Text conversion table</span>
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  debug ? "text-sky-300" : "text-stone-500",
                )}
              >
                {debug ? "On" : "Off"}
              </span>
            </button>
            {debug ? <TextConvertTable desk={desk} /> : null}
          </section>

          <section
            id="settings-system"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-system"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>System</SettingsSectionTitle>
            <dl className="space-y-2.5 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone-500">Name</dt>
                <dd className="text-right font-medium text-stone-100">
                  Domino&apos;s Stock Shelf Life
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone-500">Version</dt>
                <dd className="font-mono text-right text-stone-200">
                  {appVersionLabel()}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-stone-500">Chart</dt>
                <dd className="text-right text-stone-200">
                  {desk.imported
                    ? `${desk.pack.rules.length} items loaded`
                    : "None loaded"}
                </dd>
              </div>
              {desk.imported && desk.pack.chart.title ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-stone-500">Chart title</dt>
                  <dd className="max-w-[60%] text-right text-stone-200 [overflow-wrap:anywhere]">
                    {desk.pack.chart.title}
                  </dd>
                </div>
              ) : null}
              {desk.imported && desk.pack.chart.version ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-stone-500">Chart version</dt>
                  <dd className="text-right text-stone-200">
                    {desk.pack.chart.version}
                  </dd>
                </div>
              ) : null}
              {desk.imported && desk.pack.chart.validUntil ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-stone-500">Valid until</dt>
                  <dd className="text-right text-stone-200">
                    {formatCompactDate(desk.pack.chart.validUntil)}
                  </dd>
                </div>
              ) : null}
              {desk.imported && desk.sourceUrl ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-stone-500">Source</dt>
                  <dd className="max-w-[65%] truncate text-right text-xs text-stone-400">
                    {desk.sourceUrl}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="text-xs leading-relaxed text-stone-500">
              Checks the hosted build against this install. If a newer version
              is available, the app reloads to pick it up. Chart data on this
              device is kept.
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
              onClick={() => setChangelogOpen(true)}
            >
              <ScrollText className="size-4" />
              Changelog
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start rounded-xl border-white/10 text-base text-white"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                const toastId = toast.loading("Checking for updates…");
                void getAppUpdateInfo()
                  .then((info) => {
                    toast.dismiss(toastId);
                    if (info.available && info.remoteVersion) {
                      setPendingUpdate({
                        localVersion: info.localVersion,
                        remoteVersion: info.remoteVersion,
                        notes: info.remoteNotes,
                      });
                      setUpdateConfirmOpen(true);
                      return;
                    }
                    return reloadAppToLatest().finally(() => setOpen(false));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              <RefreshCw className="size-4" />
              Check for updates
            </Button>
          </section>
          </div>
          <div
            data-settings-end-pad
            aria-hidden
            className="pointer-events-none shrink-0"
            style={{ height: settingsEndPad }}
          />
        </div>
      </DialogContent>
      <Dialog
        open={storePrompt != null}
        onOpenChange={(next) => {
          if (!next) cancelStorePrompt();
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[60] bg-black/50"
          className="z-[60] max-h-[min(40rem,calc(100dvh-2rem))] max-w-sm gap-0 overflow-y-auto rounded-2xl p-0"
        >
          <DialogHeader className="space-y-2 px-4 pt-4 pr-14 pb-2">
            <DialogTitle className="font-display text-xl text-white">Keep settings?</DialogTitle>
            <DialogDescription className="text-sm text-stone-400">
              {storePrompt?.hasSaved
                ? `Store ${storePrompt.next} already has settings for this chart. Keep what is on screen, load the saved copy, or choose which changes to accept.`
                : `Store ${storePrompt?.next ?? ""} has nothing saved for this chart. Keep what is on screen, start fresh, or choose which changes to accept.`}
            </DialogDescription>
            <button
              type="button"
              className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Close keep settings"
              onClick={cancelStorePrompt}
            >
              <X className="size-5" />
            </button>
          </DialogHeader>
          <div className="grid gap-2 border-t border-white/10 p-4">
            <Button type="button" className="h-11 rounded-xl" onClick={() => confirmStorePrompt(true)}>
              Keep settings
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-white/15 text-white"
              onClick={() => confirmStorePrompt(false)}
            >
              {storePrompt?.hasSaved ? "Use saved" : "Start fresh"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-white/15 text-white"
              aria-expanded={changesOpen}
              onClick={() => setChangesOpen((open) => !open)}
            >
              {changesOpen ? "Hide changes" : "Show changes"}
            </Button>
            {changesOpen ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                {storeChanges.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-stone-400">
                    This chart already matches.
                  </p>
                ) : (
                  <>
                    <div className="flex justify-end px-1 pb-1">
                      <button
                        type="button"
                        className="text-xs font-medium text-stone-300 underline-offset-2 hover:underline"
                        onClick={() =>
                          setChangeChoices(
                            allChangesSelected
                              ? []
                              : storeChanges.map((change) => change.id),
                          )
                        }
                      >
                        {allChangesSelected ? "Clear" : "Select all"}
                      </button>
                    </div>
                    <ul className="max-h-52 space-y-2 overflow-y-auto">
                      {storeChanges.map((change, index) => {
                        const showGroup =
                          index === 0 || storeChanges[index - 1]?.group !== change.group;
                        const checked = changeChoices.includes(change.id);
                        return (
                          <li key={change.id}>
                            {showGroup ? (
                              <p className="px-1 pt-1 text-xs font-medium tracking-wide text-stone-500 uppercase">
                                {change.group}
                              </p>
                            ) : null}
                            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-white/5">
                              <input
                                type="checkbox"
                                className="mt-1 size-4 accent-white"
                                checked={checked}
                                onChange={() =>
                                  setChangeChoices((current) =>
                                    current.includes(change.id)
                                      ? current.filter((id) => id !== change.id)
                                      : [...current, change.id],
                                  )
                                }
                              />
                              <span className="min-w-0">
                                <span className="block text-sm text-white">{change.label}</span>
                                <span className="block text-xs text-stone-400">
                                  {change.from} → {change.to}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <Button
                      type="button"
                      className="mt-2 h-11 w-full rounded-xl"
                      disabled={changeChoices.length === 0}
                      onClick={acceptSelectedChanges}
                    >
                      Accept selected
                    </Button>
                  </>
                )}
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-white/15 text-white"
              onClick={cancelStorePrompt}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={allStoredOpen} onOpenChange={setAllStoredOpen}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[60] bg-black/50"
          className="top-1/2! left-1/2! z-[60] flex h-[min(40rem,calc(100dvh-2.5rem))] max-h-[calc(100dvh-2.5rem)] w-[calc(100%-1.25rem)] max-w-lg -translate-x-1/2! -translate-y-1/2! flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg"
        >
          <DialogHeader className="shrink-0 space-y-2 border-b border-white/10 px-4 py-3 pr-14">
            <DialogTitle className="font-display text-xl text-white">
              All stored data
            </DialogTitle>
            <DialogDescription className="text-sm text-stone-400">
              Every store saved on this device. Tap one to preview it below.
            </DialogDescription>
            <button
              type="button"
              className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Close all stored data"
              onClick={() => setAllStoredOpen(false)}
            >
              <X className="size-5" />
            </button>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {deviceStored.length === 0 ? (
              <p className="text-sm text-stone-500">Nothing is saved on this device yet.</p>
            ) : (
              deviceStored.map((item) => {
                const label = nameFor(item.storeId);
                const active = (previewStoreId ?? storeId) === item.storeId;
                return (
                  <button
                    key={`${item.storeId}|${item.issued}|${item.validUntil}`}
                    type="button"
                    onClick={() => {
                      setStoreDraft(item.storeId);
                      setStoreMenuOpen(false);
                      setStoreMenuAll(false);
                      setAllStoredOpen(false);
                    }}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-sky-400/40 bg-sky-500/10"
                        : "border-white/10 bg-black/20 hover:bg-white/[0.06]",
                    )}
                  >
                    <p className="truncate text-sm font-medium text-white">
                      {label || `Store ${item.storeId}`}
                    </p>
                    {label ? (
                      <p className="text-xs text-stone-400">Store {item.storeId}</p>
                    ) : null}
                    <p className="mt-1 truncate text-sm text-stone-200">
                      {item.title || "Shelf life chart"}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      Issued {formatShortDate(item.issued)} · Valid until{" "}
                      {formatShortDate(item.validUntil)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>

    <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[60] bg-black/50"
        className="z-[60] max-w-sm gap-0 overflow-hidden rounded-2xl p-0"
      >
        <DialogHeader className="space-y-2 px-4 pt-4 pb-2">
          <DialogTitle className="font-display text-xl text-white">
            Clear the loaded chart?
          </DialogTitle>
          <DialogDescription className="text-sm text-stone-400">
            All product data will be removed from this device. The list stays
            empty until you upload a chart again.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-white/15 text-white"
            onClick={() => setConfirmReset(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-400"
            onClick={resetChart}
          >
            <RotateCcw className="size-4" />
            Clear chart
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {pendingUpdate ? (
      <UpdateConfirmDialog
        open={updateConfirmOpen}
        onOpenChange={(next) => {
          setUpdateConfirmOpen(next);
          if (!next) setPendingUpdate(null);
        }}
        localVersion={pendingUpdate.localVersion}
        remoteVersion={pendingUpdate.remoteVersion}
        notes={pendingUpdate.notes}
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          void reloadAppToLatest().finally(() => {
            setBusy(false);
            setUpdateConfirmOpen(false);
            setPendingUpdate(null);
            setOpen(false);
          });
        }}
      />
    ) : null}

    <Dialog open={changelogOpen} onOpenChange={setChangelogOpen}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[60] bg-black/50"
        className="z-[60] flex h-[min(28rem,85dvh)] w-[calc(100%-1.25rem)] max-w-sm flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-sm"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-white/10 px-4 py-3 pr-14">
          <DialogTitle className="font-display text-xl text-white">
            Changelog
          </DialogTitle>
          <DialogDescription className="text-sm text-stone-400">
            Recent app releases on this install.
          </DialogDescription>
          <button
            type="button"
            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Close changelog"
            onClick={() => setChangelogOpen(false)}
          >
            <X className="size-5" />
          </button>
        </DialogHeader>
        <div className="min-h-0 flex-1 px-4 py-3">
          <ChangelogBrowser entries={CHANGELOG} className="h-full" />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function StoreNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-stone-500">Store name</span>
      <Input
        value={value}
        maxLength={48}
        placeholder="Name for this store"
        aria-label="Store name"
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border-white/10 bg-black/30 text-base text-white placeholder:text-stone-500"
      />
    </label>
  );
}

function StoredEditButton({
  editing,
  onToggle,
}: {
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={editing}
      onClick={onToggle}
      className={cn(
        "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold",
        editing ? "bg-red-500/15 text-red-300" : "text-stone-200 ring-1 ring-white/15",
      )}
    >
      {editing ? "Done" : "Edit"}
    </button>
  );
}

function RemoveMark({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-6 shrink-0 items-center justify-center text-red-500"
    >
      <X className="size-4" strokeWidth={2.5} />
    </button>
  );
}

function storedRowClass(index: number) {
  return cn(
    "flex min-h-8 items-center justify-between gap-2 rounded-md px-2",
    index % 2 === 0 ? "bg-white/[0.035]" : "bg-white/[0.09]",
  );
}

function StoredCampaignDetails({
  item,
  editing,
  onOpenHidden,
  onRemoveHidden,
  onRemoveDefault,
  onRemoveAllHidden,
  onRemoveAllDefaults,
}: {
  item: {
    hidden: string[];
    preset: ItemPreset;
    compactDates?: boolean;
    showDayCounts?: boolean;
    compactList?: boolean;
  };
  editing: boolean;
  onOpenHidden: (name: string) => void;
  onRemoveHidden: (name: string) => void;
  onRemoveDefault: (name: string) => void;
  onRemoveAllHidden: () => void;
  onRemoveAllDefaults: () => void;
}) {
  const defaults = productDefaultLines(item.preset);
  const dateLabel = item.showDayCounts ? "Days and hours" : item.compactDates ? "Short" : "Full";
  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">Dates</p>
      </div>
      <p className="px-2 text-sm text-stone-200">{dateLabel}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">List</p>
      </div>
      <p className="px-2 text-sm text-stone-200">{item.compactList ? "Compact" : "With tags"}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">Hidden</p>
        {editing && item.hidden.length > 0 ? (
          <button
            type="button"
            aria-label="Remove all hidden"
            onClick={onRemoveAllHidden}
            className="text-xs font-semibold text-red-400"
          >
            Remove all
          </button>
        ) : null}
      </div>
      {item.hidden.length === 0 ? (
        <p className="px-2 text-sm text-stone-200">None</p>
      ) : (
        <ul className="text-sm text-stone-200">
          {item.hidden.map((name, index) => (
            <li key={name} className={storedRowClass(index)}>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => onOpenHidden(name)}
              >
                {name}
              </button>
              {editing ? (
                <RemoveMark label={`Remove ${name}`} onClick={() => onRemoveHidden(name)} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">Defaults</p>
        {editing && defaults.length > 0 ? (
          <button
            type="button"
            aria-label="Remove all defaults"
            onClick={onRemoveAllDefaults}
            className="text-xs font-semibold text-red-400"
          >
            Remove all
          </button>
        ) : null}
      </div>
      {defaults.length === 0 ? (
        <p className="px-2 text-sm text-stone-200">None</p>
      ) : (
        <ul className="text-sm text-stone-200">
          {defaults.map((entry, index) => (
            <li key={entry.name} className={storedRowClass(index)}>
              <span className="min-w-0">{entry.line}</span>
              {editing ? (
                <RemoveMark
                  label={`Remove ${entry.name} default`}
                  onClick={() => onRemoveDefault(entry.name)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function productDefaultLines(preset: ItemPreset): { name: string; line: string }[] {
  return Object.entries(preset.defaults)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, item]) => {
      const storage = item.section ? SECTION_TAG[item.section] : null;
      if (!storage) return null;
      return { name, line: `${name} default is ${storage}` };
    })
    .filter((row): row is { name: string; line: string } => row != null);
}

function SettingsSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
      {children}
    </h3>
  );
}

function TextConvertTable({ desk }: { desk: DeskState }) {
  const now = new Date();
  const rows = textConversionTable(desk.pack, desk.deliveryDate, desk.prepTime, now);
  const start = desk.deliveryDate ? formatLongDate(desk.deliveryDate) : "not set";
  const clock = prepClockTime(desk.prepTime, now);

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-500">
        Use-bys are from the Delivery/Prep Date ({start}). Pack dates stay the printed date.
        Dough uses that date as the tray date. Hour clocks start at {clock}
        {desk.prepTime ? "" : " (live clock)"}. A life that differs from the chart is marked.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-400">Import a chart to see conversions.</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-xl ring-1 ring-white/10">
          <table className="w-full min-w-[36rem] border-collapse text-left text-xs text-stone-200">
            <thead className="sticky top-0 z-10 bg-zinc-950 text-stone-400">
              <tr>
                <th className="px-2 py-2 font-semibold">Product</th>
                <th className="px-2 py-2 font-semibold">Section</th>
                <th className="px-2 py-2 font-semibold">Field</th>
                <th className="px-2 py-2 font-semibold">Text</th>
                <th className="px-2 py-2 font-semibold">Use by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.section}:${row.name}:${row.field}:${row.text}`}
                  className="border-t border-white/10"
                >
                  <td className="px-2 py-1.5 align-top text-white">{row.name}</td>
                  <td className="px-2 py-1.5 align-top">{row.section}</td>
                  <td className="px-2 py-1.5 align-top">{row.field}</td>
                  <td
                    className={cn(
                      "px-2 py-1.5 align-top",
                      row.text.includes(" · chart ") && "text-amber-300",
                    )}
                  >
                    {row.text}
                  </td>
                  <td className="px-2 py-1.5 align-top whitespace-nowrap">{row.useBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
