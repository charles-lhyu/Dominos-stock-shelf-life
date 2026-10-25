"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { ChangelogNotes } from "@/components/changelog-notes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  subscribeAppStatus,
  type AppStatusKind,
} from "@/lib/app-status";
import {
  appSemver,
  CHANGELOG,
  changelogForVersion,
  formatAppVersion,
} from "@/lib/changelog";
import { appVersionLabel } from "@/lib/reload-app";

const VERSION_KEY = "app-version";
const JUST_UPDATED_KEY = "app-just-updated";
const AUTO_CLOSE_MS = 3000;
const AUTO_CLOSE_WITH_NOTES_MS = 10000;

/**
 * Bottom status popup: “Updated to vX” after a new build (with optional
 * changelog), or “Up to date” when Update finds nothing new.
 */
export function UpdateNotice() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AppStatusKind>("updated");
  const [fromVersion, setFromVersion] = useState<string | null>(null);
  const version = appSemver();

  useEffect(() => {
    let previous: string | null = null;
    let justUpdated = false;

    try {
      previous = window.localStorage.getItem(VERSION_KEY);
      justUpdated = window.sessionStorage.getItem(JUST_UPDATED_KEY) === "1";
      window.sessionStorage.removeItem(JUST_UPDATED_KEY);
      window.localStorage.setItem(VERSION_KEY, version);
    } catch {
      return;
    }

    setFromVersion(previous);

    if (justUpdated) {
      // Reload ran — only call it “updated” if the stored version actually changed.
      setKind(
        previous != null && previous === version ? "up-to-date" : "updated",
      );
      setOpen(true);
    } else if (previous != null && previous !== version) {
      setKind("updated");
      setOpen(true);
    }
  }, [version]);

  useEffect(() => subscribeAppStatus((next) => {
    setKind(next);
    setFromVersion(null);
    setOpen(true);
  }), []);

  const updated = kind === "updated";
  // Always surface this build’s changelog after an update.
  const latestEntry =
    changelogForVersion(version) ?? CHANGELOG[0] ?? null;
  const entries = updated && latestEntry ? [latestEntry] : [];
  const hasNotes = entries.some((entry) => entry.notes.length > 0);

  useEffect(() => {
    if (!open) return;
    // Keep open longer when there are notes to read; still dismiss on tap.
    const ms = hasNotes ? AUTO_CLOSE_WITH_NOTES_MS : AUTO_CLOSE_MS;
    const id = window.setTimeout(() => setOpen(false), ms);
    return () => window.clearTimeout(id);
  }, [open, hasNotes]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-auto bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 w-[calc(100%-1.25rem)] max-w-sm translate-y-0 cursor-pointer gap-0 rounded-2xl p-0"
        showCloseButton={false}
        onClick={() => setOpen(false)}
        onPointerUp={() => setOpen(false)}
      >
        <DialogHeader className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="flex min-w-0 items-center gap-2 font-display text-2xl text-white">
              {updated ? (
                <RefreshCw className="size-5 shrink-0 text-emerald-300" aria-hidden />
              ) : (
                <Check className="size-5 shrink-0 text-emerald-300" strokeWidth={2.75} aria-hidden />
              )}
              {updated
                ? `Updated to ${formatAppVersion(version)}`
                : "Up to date"}
            </DialogTitle>
            {!updated ? (
              <span className="shrink-0 pt-1 font-mono text-sm tracking-wide text-stone-400">
                {appVersionLabel()}
              </span>
            ) : null}
          </div>
          <DialogDescription className="text-stone-400">
            {updated
              ? fromVersion
                ? `From ${formatAppVersion(fromVersion)}. Tap anywhere to dismiss.`
                : "A newer build was installed. Tap anywhere to dismiss."
              : "You’re already on the latest version. Tap anywhere to dismiss."}
          </DialogDescription>
          {updated && latestEntry ? (
            <div
              className="mt-3 max-h-44 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-left"
              onClick={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <p className="mb-1.5 font-mono text-xs font-semibold tracking-wide text-stone-200">
                {formatAppVersion(latestEntry.version)}
              </p>
              {hasNotes ? (
                <ChangelogNotes entries={entries} compact />
              ) : (
                <p className="text-xs text-stone-500">
                  No notes for this release.
                </p>
              )}
            </div>
          ) : null}
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
