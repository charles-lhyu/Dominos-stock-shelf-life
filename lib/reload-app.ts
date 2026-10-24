import { showAppStatus } from "@/lib/app-status";
import { withBasePath } from "@/lib/base-path";

const JUST_UPDATED_KEY = "app-just-updated";
const UPDATE_POLL_MS = 60_000;

function localVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? "1.4.3";
}

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      `${withBasePath("/app-version.json")}?v=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: string };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

/** True when hosted app-version.json differs from this shell. */
export async function checkAppUpdateAvailable(): Promise<boolean> {
  // Local preview always surfaces the Settings update pulse.
  if (process.env.NODE_ENV === "development") return true;
  const remote = await fetchRemoteVersion();
  if (remote == null) return false;
  return remote !== localVersion();
}

/**
 * Poll for a newer hosted build. Re-checks on an interval, when the tab
 * becomes visible, and on window focus.
 */
export function subscribeAppUpdateAvailable(
  onChange: (available: boolean) => void,
): () => void {
  let cancelled = false;

  const run = () => {
    void checkAppUpdateAvailable().then((available) => {
      if (!cancelled) onChange(available);
    });
  };

  run();
  const timer = window.setInterval(run, UPDATE_POLL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", run);

  return () => {
    cancelled = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", run);
  };
}

/**
 * If the hosted build matches this shell, show “up to date”.
 * Otherwise clear SW/caches and reload so the PWA picks up the new build.
 */
export async function reloadAppToLatest() {
  const remote = await fetchRemoteVersion();
  if (remote != null && remote === localVersion()) {
    showAppStatus("up-to-date");
    return;
  }

  try {
    window.sessionStorage.setItem(JUST_UPDATED_KEY, "1");
  } catch {
    // Private mode may block storage — still reload.
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Still reload — cache bust below covers most stale shells.
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Ignore cache API failures.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("v", String(Date.now()));
  window.location.replace(url.toString());
}
