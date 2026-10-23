/** Pull a Google Drive file id from common share / open / download links. */
export function googleDriveFileId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isDrive =
    host === "drive.google.com" ||
    host === "drive.usercontent.google.com" ||
    host === "docs.google.com";
  if (!isDrive) return null;

  const fromPath =
    url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    url.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    url.pathname.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (fromPath) return fromPath;

  const id = url.searchParams.get("id");
  if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;

  return null;
}

export function isGoogleDriveUrl(rawUrl: string): boolean {
  return googleDriveFileId(rawUrl) != null;
}

/** Direct download URL for a publicly shared Drive file. */
export function googleDriveDownloadUrl(fileId: string): string {
  const url = new URL("https://drive.usercontent.google.com/download");
  url.searchParams.set("id", fileId);
  url.searchParams.set("export", "download");
  url.searchParams.set("confirm", "t");
  return url.toString();
}

export function fileNameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf) {
    try {
      return decodeURIComponent(utf).replace(/["']/g, "").trim() || null;
    } catch {
      return utf.replace(/["']/g, "").trim() || null;
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i)?.[1];
  return plain?.trim() || null;
}
