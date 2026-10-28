import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextBackAction } from "./back-button";

describe("back button", () => {
  it("closes a dialog before leaving an item", () => {
    assert.equal(
      nextBackAction({ dialogOpen: true, itemOpen: true, exitArmed: true }),
      "close-dialog",
    );
  });

  it("leaves item details when no dialog is open", () => {
    assert.equal(
      nextBackAction({ dialogOpen: false, itemOpen: true, exitArmed: false }),
      "leave-item",
    );
  });

  it("asks for a second press on the list, then leaves the app", () => {
    assert.equal(
      nextBackAction({ dialogOpen: false, itemOpen: false, exitArmed: false }),
      "arm-exit",
    );
    assert.equal(
      nextBackAction({ dialogOpen: false, itemOpen: false, exitArmed: true }),
      "exit",
    );
  });
});
