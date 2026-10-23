import assert from "node:assert/strict";
import { test } from "node:test";
import { googleDriveDownloadUrl, googleDriveFileId, isGoogleDriveUrl } from "./drive-url";

test("extracts Drive file ids from common share links", () => {
  assert.equal(
    googleDriveFileId("https://drive.google.com/file/d/abc123XYZ/view?usp=sharing"),
    "abc123XYZ",
  );
  assert.equal(googleDriveFileId("https://drive.google.com/open?id=abc123XYZ"), "abc123XYZ");
  assert.equal(
    googleDriveFileId("https://drive.usercontent.google.com/download?id=abc123XYZ&export=download"),
    "abc123XYZ",
  );
  assert.equal(isGoogleDriveUrl("https://example.com/file.pdf"), false);
});

test("builds the usercontent download URL", () => {
  assert.equal(
    googleDriveDownloadUrl("abc123XYZ"),
    "https://drive.usercontent.google.com/download?id=abc123XYZ&export=download&confirm=t",
  );
});
