import {
  fileNameFromContentDisposition,
  googleDriveDownloadUrl,
  googleDriveFileId,
  isGoogleDriveUrl,
} from "./drive-url";
import { parseChartPack } from "./chart-pack";
import { parsePdfChartBytes } from "./pdf-chart";
import type { ChartPack } from "./types";

type FetchResult =
  | { ok: true; pack: ChartPack; crops?: Record<string, string> }
  | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024;

function looksLikePdf(bytes: Uint8Array, contentType: string, fileName: string) {
  if (fileName.toLowerCase().endsWith(".pdf")) return true;
  if (contentType.includes("pdf")) return true;
  return (
    bytes.length >= 4 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "%PDF"
  );
}

function looksLikeJson(bytes: Uint8Array, contentType: string, fileName: string) {
  if (fileName.toLowerCase().endsWith(".json")) return true;
  if (contentType.includes("json")) return true;
  const start = new TextDecoder()
    .decode(bytes.subarray(0, Math.min(bytes.length, 32)))
    .trimStart();
  return start.startsWith("{") || start.startsWith("[");
}

function looksLikeHtml(bytes: Uint8Array) {
  const head = new TextDecoder()
    .decode(bytes.subarray(0, Math.min(bytes.length, 200)))
    .trimStart();
  return /^<!DOCTYPE html|<html[\s>]/i.test(head);
}

async function packFromBytes(
  bytes: Uint8Array,
  contentType: string,
  fileName: string,
): Promise<FetchResult> {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "That Google Drive file was empty." };
  }
  if (bytes.byteLength > MAX_BYTES) {
    return { ok: false, error: "That file is too large (max 25 MB)." };
  }
  if (looksLikeHtml(bytes)) {
    return {
      ok: false,
      error:
        "Google Drive did not return the file. Share it as “Anyone with the link”, then try again.",
    };
  }
  if (looksLikePdf(bytes, contentType, fileName)) {
    return parsePdfChartBytes(
      bytes,
      fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`,
    );
  }
  if (looksLikeJson(bytes, contentType, fileName)) {
    try {
      return parseChartPack(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      return { ok: false, error: "The Google Drive file is not valid chart JSON." };
    }
  }
  return {
    ok: false,
    error: "That Google Drive file must be a shelf-life PDF (or chart JSON).",
  };
}

async function fetchViaApi(url: string): Promise<FetchResult | null> {
  let response: Response;
  try {
    response = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/fetch-chart`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      },
    );
  } catch {
    return null;
  }

  // Static Pages export has no API route — fall through to a direct download.
  if (response.status === 404 || response.status === 405) return null;

  if (!response.ok) {
    try {
      const payload = (await response.json()) as { error?: string };
      return {
        ok: false,
        error: payload.error ?? `Download failed (${response.status}).`,
      };
    } catch {
      return { ok: false, error: `Download failed (${response.status}).` };
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const encodedName = response.headers.get("x-file-name");
  let fileName = "chart";
  if (encodedName) {
    try {
      fileName = decodeURIComponent(encodedName);
    } catch {
      fileName = encodedName;
    }
  }
  return await packFromBytes(bytes, contentType, fileName);
}

async function fetchViaDirectDrive(url: string): Promise<FetchResult> {
  const fileId = googleDriveFileId(url);
  if (!fileId) {
    return {
      ok: false,
      error: "That QR / link is not a Google Drive file link.",
    };
  }

  const downloadUrl = googleDriveDownloadUrl(fileId);
  let response: Response;
  try {
    response = await fetch(downloadUrl, {
      redirect: "follow",
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error:
        "Could not download that Drive file in this browser (blocked or offline). Try PDF chart, or use the app with the local server.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Google Drive download failed (${response.status}). Make sure the file is shared as “Anyone with the link”.`,
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const fileName =
    fileNameFromContentDisposition(
      response.headers.get("content-disposition"),
    ) ?? "chart.pdf";
  return await packFromBytes(bytes, contentType, fileName);
}

export async function fetchRemoteChart(url: string): Promise<FetchResult> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: "Paste a Google Drive share link." };

  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: "That does not look like a valid link." };
  }

  if (!isGoogleDriveUrl(trimmed)) {
    return {
      ok: false,
      error:
        "Use a Google Drive share link to the shelf-life PDF (Anyone with the link).",
    };
  }

  const viaApi = await fetchViaApi(trimmed);
  if (viaApi) return viaApi;
  return fetchViaDirectDrive(trimmed);
}
