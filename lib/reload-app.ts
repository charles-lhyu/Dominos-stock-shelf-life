import { showAppStatus } from "@/lib/app-status";
import { withBasePath } from "@/lib/base-path";
import { appSemver, formatAppVersion } from "@/lib/changelog";

const JUST_UPDATED_KEY = "app-just-updated";
const UPDATE_POLL_MS = 60_000;

export type RemoteAppInfo = {
  version: string;
  notes: string[];
};

export type AppUpdateInfo = {
  available: boolean;
  localVersion: string;
  remoteVersion: string | null;
  remoteNotes: string[];
};

function localVersion() {
  return appSemver();
}

/** Header / notice label — `dev` on local preview, real semver in production. */
export function appVersionLabel() {
  if (process.env.NODE_ENV === "development") return "dev";
  return formatAppVersion(localVersion());
}

export function localAppVersion() {
  return localVersion();
}

export async function fetchRemoteAppInfo(): Promise<RemoteAppInfo | null> {
  try {
    const response = await fetch(
      `${withBasePath("/app-version.json")}?v=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      version?: string;
      notes?: unknown;
    };
    if (typeof data.version !== "string" || !data.version.trim()) return null;
    const notes = Array.isArray(data.notes)
      ? data.notes.filter((item): item is string => typeof item === "string")
      : [];
    return { version: data.version.trim(), notes };
  } catch {
    return null;
  }
}

/** True when hosted app-version.json differs from this shell. */
export async function checkAppUpdateAvailable(): Promise<boolean> {
  const info = await getAppUpdateInfo();
  return info.available;
}

export async function getAppUpdateInfo(): Promise<AppUpdateInfo> {
  const local = localVersion();
  if (process.env.NODE_ENV === "development") {
    return {
      available: false,
      localVersion: local,
      remoteVersion: null,
      remoteNotes: [],
    };
  }
  const remote = await fetchRemoteAppInfo();
  if (remote == null) {
    return {
      available: false,
      localVersion: local,
      remoteVersion: null,
      remoteNotes: [],
    };
  }
  return {
    available: remote.version !== local,
    localVersion: local,
    remoteVersion: remote.version,
    remoteNotes: remote.notes,
  };
}

/**
 * Poll for a newer hosted build. Re-checks on an interval, when the tab
 * becomes visible, and on window focus.
 */
export function subscribeAppUpdateAvailable(
  onChange: (info: AppUpdateInfo) => void,
): () => void {
  let cancelled = false;

  const run = () => {
    void getAppUpdateInfo().then((info) => {
      if (!cancelled) onChange(info);
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
 * If the hosted build matches this shell (or can’t be read), show “up to date”.
 * Only reload when the remote version is known and different.
 */
export async function reloadAppToLatest() {
  const remote = await fetchRemoteAppInfo();
  if (remote == null || remote.version === localVersion()) {
    showAppStatus("up-to-date");
    return { updated: false as const };
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
  return { updated: true as const };
}
