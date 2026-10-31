import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GOOGLE_DRIVE_READONLY_SCOPE,
  getCachedGoogleDriveToken,
  getGoogleOAuthClientId,
  isGoogleDriveApiConfigured,
} from "./google-drive-api";

test("Drive readonly scope is the Google Drive API scope", () => {
  assert.equal(
    GOOGLE_DRIVE_READONLY_SCOPE,
    "https://www.googleapis.com/auth/drive.readonly",
  );
});

test("Google OAuth client id comes from NEXT_PUBLIC_GOOGLE_CLIENT_ID", () => {
  assert.equal(typeof getGoogleOAuthClientId(), "string");
  assert.equal(isGoogleDriveApiConfigured(), getGoogleOAuthClientId().length > 0);
  assert.equal(getCachedGoogleDriveToken(), null);
});
