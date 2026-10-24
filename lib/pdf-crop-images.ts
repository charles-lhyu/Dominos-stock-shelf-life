const DB_NAME = "shelf-life-pdf-crops";
const CROP_STORE = "crops";
const META_STORE = "meta";
const SOURCE_KEY = "source-pdf";
const DB_VERSION = 3;

/** In-memory fallback so crops show immediately even if IndexedDB is blocked. */
const memoryCrops = new Map<string, string>();
let memoryPdf: Uint8Array | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CROP_STORE)) {
        db.createObjectStore(CROP_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
  });
}

/** Keep the imported PDF so row crops can be built on demand. */
export async function saveSourcePdf(bytes: Uint8Array): Promise<void> {
  memoryPdf = bytes.slice();
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put(bytes.slice().buffer, SOURCE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB PDF write failed"));
    });
    db.close();
  } catch {
    // Memory copy still available this session.
  }
}

export async function getSourcePdf(): Promise<Uint8Array | null> {
  if (memoryPdf) return memoryPdf;
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const value = await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const request = tx.objectStore(META_STORE).get(SOURCE_KEY);
      request.onsuccess = () => {
        resolve(request.result instanceof ArrayBuffer ? request.result : null);
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB PDF read failed"));
    });
    db.close();
    if (!value) return null;
    memoryPdf = new Uint8Array(value);
    return memoryPdf;
  } catch {
    return null;
  }
}

/** Replace all stored PDF row crop images (data URLs keyed by rule id). */
export async function replacePdfCrops(crops: Record<string, string>): Promise<void> {
  memoryCrops.clear();
  for (const [id, dataUrl] of Object.entries(crops)) {
    if (dataUrl) memoryCrops.set(id, dataUrl);
  }
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CROP_STORE, "readwrite");
      const store = tx.objectStore(CROP_STORE);
      store.clear();
      for (const [id, dataUrl] of Object.entries(crops)) {
        if (dataUrl) store.put(dataUrl, id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
    db.close();
  } catch {
    // Private mode / quota — memory map still holds crops for this session.
  }
}

export async function putPdfCropImage(ruleId: string, dataUrl: string): Promise<void> {
  memoryCrops.set(ruleId, dataUrl);
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CROP_STORE, "readwrite");
      tx.objectStore(CROP_STORE).put(dataUrl, ruleId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB crop write failed"));
    });
    db.close();
  } catch {
    // Memory still has it.
  }
}

export async function clearPdfCrops(): Promise<void> {
  memoryPdf = null;
  memoryCrops.clear();
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([CROP_STORE, META_STORE], "readwrite");
      tx.objectStore(CROP_STORE).clear();
      tx.objectStore(META_STORE).delete(SOURCE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB clear failed"));
    });
    db.close();
  } catch {
    // Ignore.
  }
}

export async function getPdfCropImage(ruleId: string): Promise<string | null> {
  const cached = memoryCrops.get(ruleId);
  if (cached) return cached;
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(CROP_STORE, "readonly");
      const request = tx.objectStore(CROP_STORE).get(ruleId);
      request.onsuccess = () => {
        resolve(typeof request.result === "string" ? request.result : null);
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
    db.close();
    if (value) memoryCrops.set(ruleId, value);
    return value;
  } catch {
    return null;
  }
}
