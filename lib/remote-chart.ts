import { parseChartPack } from "./chart-pack";
import { parsePdfChartBytes } from "./pdf-chart";
import type { ChartPack } from "./types";

type FetchResult =
  | { ok: true; pack: ChartPack; crops?: Record<string, string> }
  | { ok: false; error: string };

function looksLikePdf(bytes: Uint8Array, contentType: string, fileName: string) {
  if (fileName.toLowerCase().endsWith(".pdf")) return true;
  if (contentType.includes("pdf")) return true;
  return bytes.length >= 4 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "%PDF";
}

function looksLikeJson(bytes: Uint8Array, contentType: string, fileName: string) {
  if (fileName.toLowerCase().endsWith(".json")) return true;
  if (contentType.includes("json")) return true;
  const start = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 32))).trimStart();
  return start.startsWith("{") || start.startsWith("[");
}

export async function fetchRemoteChart(url: string): Promise<FetchResult> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: "Paste a Google Drive share link." };

  let response: Response;
  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/fetch-chart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmed }),
    });
  } catch {
    return { ok: false, error: "Could not download that link. Check Wi‑Fi and try again." };
  }

  if (!response.ok) {
    try {
      const payload = (await response.json()) as { error?: string };
      return { ok: false, error: payload.error ?? `Download failed (${response.status}).` };
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

  if (looksLikePdf(bytes, contentType, fileName)) {
    return parsePdfChartBytes(bytes, fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`);
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
