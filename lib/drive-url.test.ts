import assert from "node:assert/strict";
import { test } from "node:test";
import {
  driveHtmlFailureMessage,
  driveResponseNeedsGoogleLogin,
  googleDriveDownloadUrl,
  googleDriveFileId,
  isGoogleDriveUrl,
} from "./drive-url";

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

test("detects Google sign-in HTML from Drive", () => {
  assert.equal(
    driveResponseNeedsGoogleLogin(
      '<html><a href="https://accounts.google.com/ServiceLogin">Sign in</a></html>',
    ),
    true,
  );
  assert.equal(
    driveResponseNeedsGoogleLogin("<html><body>virus scan warning</body></html>"),
    false,
  );
  assert.match(
    driveHtmlFailureMessage(
      '<html><a href="https://accounts.google.com/ServiceLogin">Sign in</a></html>',
    ),
    /Google sign-in/,
  );
});
