"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
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

const VERSION_KEY = "app-version";
const JUST_UPDATED_KEY = "app-just-updated";
const AUTO_CLOSE_MS = 3000;

function currentVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
}

/**
 * Bottom status popup: “App updated” after a new build, or “App up to date”
 * when Update finds nothing new. Closes after 5s or on any tap.
 */
export function UpdateNotice() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AppStatusKind>("updated");

  useEffect(() => {
    const version = currentVersion();
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

    if (justUpdated || (previous != null && previous !== version)) {
      setKind("updated");
      setOpen(true);
    }
  }, []);

  useEffect(() => subscribeAppStatus((next) => {
    setKind(next);
    setOpen(true);
  }), []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [open]);

  const updated = kind === "updated";

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
              {updated ? "App updated" : "App up to date"}
            </DialogTitle>
            <span className="shrink-0 pt-1 font-mono text-sm tracking-wide text-stone-400">
              {currentVersion()}
            </span>
          </div>
          <DialogDescription className="text-stone-400">
            {updated
              ? "You’re on the latest version. Tap anywhere to dismiss."
              : "No newer build found. Tap anywhere to dismiss."}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
