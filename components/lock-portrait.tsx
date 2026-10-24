"use client";

import { useEffect, useRef, type ReactNode } from "react";

type OrientationWithLock = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
};

async function tryLockPortrait() {
  const orientation = screen.orientation as OrientationWithLock | undefined;
  const lock = orientation?.lock;
  if (typeof lock !== "function") return;
  try {
    await lock.call(orientation, "portrait");
  } catch {
    // Many browsers only allow this when installed / fullscreen.
  }
}

/**
 * Keeps the UI looking like portrait: when the device is landscape, the
 * content is rotated so layout and controls match the upright phone view.
 */
export function LockPortrait({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
      const landscape = wide > tall;

      if (!landscape) {
        clear();
        return;
      }

      // Logical portrait frame: short side × long side, then counter-rotate.
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

      if (angle === 90 || angle === -270) {
        root.style.transform = "rotate(-90deg) translateX(-100%)";
      } else {
        root.style.transform = "rotate(90deg) translateY(-100%)";
      }
    };

    apply();
    void tryLockPortrait();

    const onGesture = () => {
      void tryLockPortrait();
    };

    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    screen.orientation?.addEventListener?.("change", apply);
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("touchstart", onGesture, { once: true });

    return () => {
      clear();
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
