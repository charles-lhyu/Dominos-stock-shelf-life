"use client";

import { useEffect, useRef } from "react";
import {
  getKeepAwake,
  hydrateKeepAwakeStore,
  subscribeKeepAwake,
} from "@/lib/keep-awake-store";

/**
 * Holds a Screen Wake Lock while enabled and the tab is visible so phones
 * don’t sleep mid-prep. Re-requests after the page is shown again (browsers
 * drop the lock when hidden). No-ops where the API is missing.
 */
export function KeepAwake() {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    hydrateKeepAwakeStore();

    let cancelled = false;

    async function release() {
      const lock = lockRef.current;
      lockRef.current = null;
      if (!lock) return;
      try {
        await lock.release();
      } catch {
        // Already released.
      }
    }

    async function request() {
      if (cancelled) return;
      if (!getKeepAwake()) {
        await release();
        return;
      }
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      if (!("wakeLock" in navigator) || typeof navigator.wakeLock?.request !== "function") {
        return;
      }
      if (lockRef.current && !lockRef.current.released) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled || !getKeepAwake()) {
          try {
            await lock.release();
          } catch {
            // Ignore.
          }
          return;
        }
        lockRef.current = lock;
        lock.addEventListener("release", () => {
          if (lockRef.current === lock) lockRef.current = null;
        });
      } catch {
        // Denied / unsupported context — ignore.
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void request();
      else void release();
    }

    const unsub = subscribeKeepAwake(() => {
      void request();
    });

    void request();
    document.addEventListener("visibilitychange", onVisible);
    // Some browsers only grant after a gesture; retry once on first tap.
    const onPointer = () => {
      void request();
    };
    document.addEventListener("pointerdown", onPointer, { once: true, passive: true });

    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", onPointer);
      void release();
    };
  }, []);

  return null;
}
