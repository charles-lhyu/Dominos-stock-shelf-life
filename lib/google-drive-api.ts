/** Browser Google Identity Services + Drive API download helpers. */

export const GOOGLE_DRIVE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const MAX_BYTES = 25 * 1024 * 1024;

type CachedToken = { token: string; expiresAt: number };

let gisLoadPromise: Promise<void> | null = null;
let cachedToken: CachedToken | null = null;

export function getGoogleOAuthClientId(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
}

export function isGoogleDriveApiConfigured(): boolean {
  return getGoogleOAuthClientId().length > 0;
}

export function getCachedGoogleDriveToken(): string | null {
  if (!cachedToken) return null;
  if (cachedToken.expiresAt <= Date.now() + 60_000) {
    cachedToken = null;
    return null;
  }
  return cachedToken.token;
}

export function clearCachedGoogleDriveToken() {
  cachedToken = null;
}

function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google sign-in only works in the browser."));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Could not load Google sign-in.")),
        { once: true },
      );
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadPromise = null;
      reject(new Error("Could not load Google sign-in."));
    };
    document.head.appendChild(script);
  }).then(() => {
    if (!window.google?.accounts?.oauth2) {
      throw new Error("Google sign-in did not start.");
    }
  });

  return gisLoadPromise;
}

/**
 * Opens the Google account / consent popup and returns a Drive access token.
 * Must be called from a user gesture (button click).
 */
export async function requestGoogleDriveAccessToken(): Promise<string> {
  const clientId = getGoogleOAuthClientId();
  if (!clientId) {
    throw new Error(
      "Google Drive sign-in is not configured (missing OAuth client id).",
    );
  }

  const existing = getCachedGoogleDriveToken();
  if (existing) return existing;

  await loadGoogleIdentityServices();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_READONLY_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                "Google sign-in failed.",
            ),
          );
          return;
        }
        const seconds = Number(response.expires_in);
        cachedToken = {
          token: response.access_token,
          expiresAt: Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000,
        };
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(
          new Error(
            error.message ||
              (error.type === "popup_closed"
                ? "Google sign-in was cancelled."
                : "Google sign-in failed."),
          ),
        );
      },
    });
    client.requestAccessToken();
  });
}

export type DriveFileDownload = {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
};

/** Download a Drive file the signed-in account can open (PDF / JSON). */
export async function downloadGoogleDriveFile(
  fileId: string,
  accessToken: string,
): Promise<DriveFileDownload> {
  const metaUrl = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  );
  metaUrl.searchParams.set("fields", "name,mimeType");
  metaUrl.searchParams.set("supportsAllDrives", "true");

  const metaResponse = await fetch(metaUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (metaResponse.status === 401 || metaResponse.status === 403) {
    clearCachedGoogleDriveToken();
    throw new Error(
      "Google could not open that Drive file with this account. Try another account, or share the file with it.",
    );
  }
  if (!metaResponse.ok) {
    throw new Error(`Google Drive lookup failed (${metaResponse.status}).`);
  }

  const meta = (await metaResponse.json()) as {
    name?: string;
    mimeType?: string;
  };
  const fileName = meta.name?.trim() || "chart.pdf";
  const metaType = meta.mimeType?.trim() || "";

  const mediaUrl = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  );
  mediaUrl.searchParams.set("alt", "media");
  mediaUrl.searchParams.set("supportsAllDrives", "true");

  const mediaResponse = await fetch(mediaUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (mediaResponse.status === 401 || mediaResponse.status === 403) {
    clearCachedGoogleDriveToken();
    throw new Error(
      "Google could not download that Drive file with this account.",
    );
  }
  if (!mediaResponse.ok) {
    throw new Error(`Google Drive download failed (${mediaResponse.status}).`);
  }

  const buffer = new Uint8Array(await mediaResponse.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("That Google Drive file was empty.");
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("That file is too large (max 25 MB).");
  }

  const contentType =
    mediaResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
    metaType ||
    "application/octet-stream";

  return { bytes: buffer, contentType, fileName };
}
