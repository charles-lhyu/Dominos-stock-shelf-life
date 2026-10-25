import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  changelogForVersion,
  changelogsSince,
  compareVersions,
  formatAppVersion,
} from "./changelog";

describe("changelog helpers", () => {
  it("formats versions with a v prefix", () => {
    assert.equal(formatAppVersion("1.4.11"), "v1.4.11");
    assert.equal(formatAppVersion("v1.4.11"), "v1.4.11");
  });

  it("compares semver-ish strings", () => {
    assert.ok(compareVersions("1.4.10", "1.4.11") < 0);
    assert.equal(compareVersions("1.4.11", "1.4.11"), 0);
    assert.ok(compareVersions("1.5.0", "1.4.11") > 0);
  });

  it("finds notes for a version", () => {
    const entry = changelogForVersion("1.4.11");
    assert.ok(entry);
    assert.ok(entry.notes.length > 0);
  });

  it("lists releases since a previous version", () => {
    const entries = changelogsSince("1.4.10", "1.4.11");
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.version, "1.4.11");
  });
});
