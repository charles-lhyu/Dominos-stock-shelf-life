export type BackAction = "close-dialog" | "leave-item" | "arm-exit" | "exit";

/** Settings and item details close first. On the list, the next back leaves the app. */
export function nextBackAction(input: {
  dialogOpen: boolean;
  itemOpen: boolean;
  exitArmed: boolean;
}): BackAction {
  if (input.dialogOpen) return "close-dialog";
  if (input.itemOpen) return "leave-item";
  if (input.exitArmed) return "exit";
  return "arm-exit";
}

function isVisibleDialog(node: Element): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
  return node.getClientRects().length > 0;
}

export function hasOpenDialog(root: ParentNode = document): boolean {
  return [...root.querySelectorAll("[role='dialog']")].some(isVisibleDialog);
}

/** Close the top open dialog. Confirmations cancel. Settings uses its close button. */
export function dismissTopDialog(root: ParentNode = document): boolean {
  const dialogs = [...root.querySelectorAll("[role='dialog']")].filter(isVisibleDialog);
  dialogs.sort((a, b) => {
    const za = Number(getComputedStyle(a).zIndex) || 0;
    const zb = Number(getComputedStyle(b).zIndex) || 0;
    return za - zb;
  });
  const top = dialogs[dialogs.length - 1];
  if (!top) return false;
  const close = top.querySelector<HTMLElement>("button[aria-label^='Close' i]");
  if (close) {
    close.click();
    return true;
  }
  const cancel = [...top.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Cancel",
  );
  if (cancel) {
    cancel.click();
    return true;
  }
  top.click();
  top.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }),
  );
  return true;
}
