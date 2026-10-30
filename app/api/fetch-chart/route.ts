import {
  driveHtmlFailureMessage,
  fileNameFromContentDisposition,
  googleDriveDownloadUrl,
  googleDriveFileId,
} from "@/lib/drive-url";

const MAX_BYTES = 25 * 1024 * 1024;

function badRequest(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

function resolveFetchUrl(raw: string): { ok: true; url: string; drive: boolean } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That does not look like a valid URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Use an http or https link." };
  }

  const fileId = googleDriveFileId(parsed.toString());
  if (fileId) {
    return { ok: true, url: googleDriveDownloadUrl(fileId), drive: true };
  }
  return { ok: true, url: parsed.toString(), drive: false };
}

async function readBody(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { url?: unknown };
    return typeof body.url === "string" ? body.url : null;
  }
  const form = await request.formData().catch(() => null);
  const fromForm = form?.get("url");
  return typeof fromForm === "string" ? fromForm : null;
}

export async function POST(request: Request) {
  const rawUrl = await readBody(request);
  if (!rawUrl?.trim()) return badRequest("Paste a Google Drive share link.");

  const resolved = resolveFetchUrl(rawUrl);
  if (!resolved.ok) return badRequest(resolved.error);

  let response: Response;
  try {
    response = await fetch(resolved.url, {
      redirect: "follow",
      headers: {
        Accept: "*/*",
        "User-Agent": "DominosShelfLife/1.0",
      },
      cache: "no-store",
    });
  } catch {
    return badRequest(
      resolved.drive
        ? "Could not reach Google Drive. Check the link or try again on Wi‑Fi."
        : "Could not reach that URL. Check the link or try again on Wi‑Fi.",
      502,
    );
  }

  if (!response.ok) {
    return badRequest(
      resolved.drive
        ? `Google Drive download failed (${response.status}). Make sure the file is shared as “Anyone with the link”.`
        : `Download failed (${response.status}).`,
      502,
    );
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    return badRequest(resolved.drive ? "That Google Drive file was empty." : "That URL returned an empty file.");
  }
  if (buffer.byteLength > MAX_BYTES) {
    return badRequest("That file is too large (max 25 MB).");
  }

  const decoder = new TextDecoder();
  const head = decoder.decode(buffer.subarray(0, Math.min(buffer.byteLength, 200)));
  const magic = decoder.decode(buffer.subarray(0, Math.min(buffer.byteLength, 4)));
  if (/<!DOCTYPE html|<html[\s>]/i.test(head)) {
    const sample = decoder.decode(
      buffer.subarray(0, Math.min(buffer.byteLength, 8000)),
    );
    return badRequest(
      resolved.drive
        ? driveHtmlFailureMessage(sample)
        : "That URL returned a web page, not a chart file.",
    );
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    (magic === "%PDF"
      ? "application/pdf"
      : head.trimStart().startsWith("{")
        ? "application/json"
        : "application/octet-stream");

  const fileName =
    fileNameFromContentDisposition(response.headers.get("content-disposition")) ??
    (contentType.includes("pdf") || magic === "%PDF"
      ? "chart.pdf"
      : contentType.includes("json") || head.trimStart().startsWith("{")
        ? "chart.json"
        : "chart.bin");

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.byteLength),
      "X-File-Name": encodeURIComponent(fileName),
      "Cache-Control": "no-store",
    },
  });
}
