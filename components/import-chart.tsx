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
  Eye,
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
  Unlock,
  X,
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
import { CHANGELOG } from "@/lib/changelog";
import { parseChartPack } from "@/lib/chart-pack";
import { formatCompactDate, formatLongDate } from "@/lib/dates";
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
import { prepClockTime } from "@/lib/preview";
import {
  appVersionLabel,
  getAppUpdateInfo,
  reloadAppToLatest,
} from "@/lib/reload-app";
import { textConversionTable } from "@/lib/text-conversion";
import { fetchRemoteChart } from "@/lib/remote-chart";
import type { ChartPack } from "@/lib/types";
import {
  DEFAULT_ROTATION_PREF,
  getRotationPref,
  hydrateRotationStore,
  setPreferredOrientation,
  setRotationLocked,
  subscribeRotation,
} from "@/lib/rotation-store";
import { cn } from "cn";
import { toast } from "sonner";

type SettingsSectionId =
  | "settings-chart"
  | "settings-display"
  | "settings-hidden"
  | "settings-debug"
  | "settings-app";

const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  "settings-chart",
  "settings-display",
  "settings-hidden",
  "settings-debug",
  "settings-app",
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
}: {
  desk: DeskState;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("settings-chart");
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
  const debug = useSyncExternalStore(subscribeDebug, readDebug, () => false);
  const debugDays = useSyncExternalStore(
    subscribeDebug,
    readDebugDays,
    () => false,
  );
  const hiddenNames = useSyncExternalStore(
    subscribeHidden,
    getHiddenNames,
    getHiddenNamesServer,
  );
  const rotation = useSyncExternalStore(
    subscribeRotation,
    () => {
      hydrateRotationStore();
      return getRotationPref();
    },
    () => DEFAULT_ROTATION_PREF,
  );

  useEffect(() => () => stopScan(), []);

  function handleOpenChange(next: boolean) {
    if (next) {
      setUrl(desk.sourceUrl);
      setConfirmReset(false);
      setChangelogOpen(false);
      setUpdateConfirmOpen(false);
      setActiveSettingsSection("settings-chart");
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
    }
    setOpen(next);
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
    { id: "settings-chart" as const, label: "Chart" },
    { id: "settings-display" as const, label: "Display" },
    {
      id: "settings-hidden" as const,
      label: `Hidden${hiddenNames.length ? ` (${hiddenNames.length})` : ""}`,
    },
    { id: "settings-debug" as const, label: "Debug" },
    { id: "settings-app" as const, label: "App" },
  ];

  const activeSettingsLabel =
    settingsNav.find((item) => item.id === activeSettingsSection)?.label ??
    "Chart";

  const settingsSelectLabels = Object.fromEntries(
    settingsNav.map((item) => [item.id, item.label]),
  );

  function syncNavCard(id: SettingsSectionId) {
    const nav = settingsNavRef.current;
    const chip = nav?.querySelector<HTMLElement>(
      `button[data-settings-nav="${id}"]`,
    );
    if (!nav || !chip) return;
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
    const last = body.querySelector<HTMLElement>("#settings-app");
    if (!last || body.clientHeight <= 0) return 0;
    // Pane is a fixed viewport — pad so App's top can sit at the pane top.
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
      const app = body.querySelector("#settings-app");
      if (app) resizeObserver.observe(app);
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
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/25"
            aria-label="Settings"
          />
        }
      >
        <Settings className="size-5" />
      </DialogTrigger>
      <DialogContent
        className="relative flex h-[90dvh] max-h-[90dvh] w-[calc(100%-1.25rem)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-white/10 px-4 py-3 pr-14">
          <DialogTitle className="font-display text-2xl text-white">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Chart, display, hidden products, debug, and app updates.
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
            id="settings-chart"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-chart"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>Chart</SettingsSectionTitle>

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
          </section>

          <section
            id="settings-hidden"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-hidden"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <SettingsSectionTitle>
                Hidden ({hiddenNames.length})
              </SettingsSectionTitle>
              {hiddenNames.length > 0 ? (
                <button
                  type="button"
                  onClick={() => clearHiddenNames()}
                  className="text-xs font-medium text-stone-400 underline-offset-2 hover:text-white hover:underline"
                >
                  Show all
                </button>
              ) : null}
            </div>
            {hiddenNames.length === 0 ? (
              <p className="text-sm text-stone-500">
                Hide a product from its detail card. It leaves the list until you show
                it again here.
              </p>
            ) : (
              <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-card">
                {hiddenNames.map((name) => (
                  <li key={name} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-white">
                      {name}
                    </span>
                    <button
                      type="button"
                      onClick={() => unhideProductName(name)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-xs font-semibold text-stone-200 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
                      aria-label={`Show ${name} in the list again`}
                    >
                      <Eye className="size-3.5" aria-hidden />
                      Show
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
            id="settings-app"
            className={cn(
              "scroll-mt-2 space-y-3 rounded-2xl border p-3 transition-[border-color,box-shadow] duration-200",
              activeSettingsSection === "settings-app"
                ? "border-sky-400/40 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                : "border-white/10 bg-card/80",
            )}
          >
            <SettingsSectionTitle>App</SettingsSectionTitle>
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
