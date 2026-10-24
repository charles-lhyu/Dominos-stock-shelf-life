const STORAGE_KEY = "rotation-pref-v1";
const LEGACY_KEY = "portrait-lock-enabled";

/** Phone-sized short edge — wider than this skips forced rotate (desktop). */
export const PHONE_SHORT_EDGE_MAX = 540;

export type PreferredOrientation = "portrait" | "landscape";

export type RotationPref = {
  orientation: PreferredOrientation;
  locked: boolean;
};

/** Default: portrait locked. */
export const DEFAULT_ROTATION_PREF: RotationPref = {
  orientation: "portrait",
  locked: true,
};

const DEFAULT_PREF = DEFAULT_ROTATION_PREF;

let pref: RotationPref = { ...DEFAULT_PREF };
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readLegacy(): RotationPref | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw == null) return null;
    if (raw === "0" || raw === "false") {
      return { orientation: "portrait", locked: false };
    }
    if (raw === "1" || raw === "true") {
      return { orientation: "portrait", locked: true };
    }
  } catch {
    // Ignore.
  }
  return null;
}

export function hydrateRotationStore() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<RotationPref>;
      const orientation =
        data.orientation === "landscape" || data.orientation === "portrait"
          ? data.orientation
          : DEFAULT_PREF.orientation;
      const locked = typeof data.locked === "boolean" ? data.locked : DEFAULT_PREF.locked;
      pref = { orientation, locked };
      return;
    }
    const legacy = readLegacy();
    if (legacy) {
      pref = legacy;
      writeStored(pref);
      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        // Ignore.
      }
    }
  } catch {
    // Keep default.
  }
}

function writeStored(next: RotationPref) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode.
  }
}

export function getRotationPref(): RotationPref {
  return pref;
}

export function setPreferredOrientation(orientation: PreferredOrientation) {
  pref = { ...pref, orientation };
  writeStored(pref);
  emit();
}

export function setRotationLocked(locked: boolean) {
  pref = { ...pref, locked };
  writeStored(pref);
  emit();
}

export function subscribeRotation(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Force CSS rotate on phone-sized viewports when locked away from natural orientation. */
export function shouldForceRotate(
  width: number,
  height: number,
  preference: RotationPref = pref,
) {
  if (!preference.locked) return false;
  if (Math.min(width, height) > PHONE_SHORT_EDGE_MAX) return false;

  const isLandscape = width > height;
  if (preference.orientation === "portrait") return isLandscape;
  return !isLandscape;
}
