/** Canonical hosted URL for sharing the app (QR + copy link). */
export const APP_SHARE_URL =
  "https://charles-lhyu.github.io/Dominos-stock-shelf-life/";

export async function copyAppShareLink(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(APP_SHARE_URL);
    return true;
  } catch {
    try {
      const field = document.createElement("textarea");
      field.value = APP_SHARE_URL;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.left = "-9999px";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(field);
      return ok;
    } catch {
      return false;
    }
  }
}

export async function shareAppLink(): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Domino's Stock Shelf Life",
        text: "Open the stock shelf life desk",
        url: APP_SHARE_URL,
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "failed";
      }
    }
  }
  return (await copyAppShareLink()) ? "copied" : "failed";
}
