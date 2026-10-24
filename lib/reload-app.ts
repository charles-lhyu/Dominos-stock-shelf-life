/**
 * Drop the controlling service worker / caches and reload so the installed
 * PWA picks up the latest GitHub Pages build.
 */
export async function reloadAppToLatest() {
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
