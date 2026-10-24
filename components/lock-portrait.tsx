"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  getRotationPref,
  hydrateRotationStore,
  shouldForceRotate,
  subscribeRotation,
} from "@/lib/rotation-store";

type OrientationWithLock = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
};

async function tryNativeLock() {
  const { locked, orientation } = getRotationPref();
  if (!locked) return;
  const screenOrientation = screen.orientation as OrientationWithLock | undefined;
  const lock = screenOrientation?.lock;
  if (typeof lock !== "function") return;
  try {
    await lock.call(screenOrientation, orientation);
  } catch {
    // Many browsers only allow this when installed / fullscreen.
  }
}

/**
 * When rotation is locked, keep the UI in the preferred orientation on phones
 * (CSS counter-rotate). Wide desktops never rotate.
 */
export function LockPortrait({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hydrateRotationStore();
    const root = rootRef.current;
    if (!root) return;

    const clear = () => {
      root.style.position = "";
      root.style.top = "";
      root.style.left = "";
      root.style.width = "";
      root.style.height = "";
      root.style.maxWidth = "";
      root.style.transform = "";
      root.style.transformOrigin = "";
    };

    const apply = () => {
      const wide = window.innerWidth;
      const tall = window.innerHeight;
      const preference = getRotationPref();

      if (!shouldForceRotate(wide, tall, preference)) {
        clear();
        return;
      }

      // Swap axes then counter-rotate so the preferred orientation fills the phone.
      root.style.position = "fixed";
      root.style.top = "0";
      root.style.left = "0";
      root.style.width = `${tall}px`;
      root.style.height = `${wide}px`;
      root.style.maxWidth = `${tall}px`;
      root.style.transformOrigin = "top left";

      const angle =
        screen.orientation?.angle ??
        (typeof window.orientation === "number" ? window.orientation : 90);

      if (preference.orientation === "portrait") {
        if (angle === 90 || angle === -270) {
          root.style.transform = "rotate(-90deg) translateX(-100%)";
        } else {
          root.style.transform = "rotate(90deg) translateY(-100%)";
        }
      } else if (angle === 0 || angle === 360) {
        root.style.transform = "rotate(90deg) translateY(-100%)";
      } else {
        root.style.transform = "rotate(-90deg) translateX(-100%)";
      }
    };

    apply();
    void tryNativeLock();

    const onGesture = () => {
      void tryNativeLock();
    };

    const unsub = subscribeRotation(() => {
      apply();
      void tryNativeLock();
    });

    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    screen.orientation?.addEventListener?.("change", apply);
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("touchstart", onGesture, { once: true });

    return () => {
      clear();
      unsub();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      screen.orientation?.removeEventListener?.("change", apply);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("touchstart", onGesture);
    };
  }, []);

  return (
    <div ref={rootRef} className="flex h-dvh min-h-0 w-full flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
