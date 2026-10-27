import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeStoreId } from "./store-id-store";

describe("store id", () => {
  it("keeps a numeric store id and drops spaces", () => {
    assert.equal(normalizeStoreId("12345"), "12345");
    assert.equal(normalizeStoreId(" 12 345 "), "12345");
    assert.equal(normalizeStoreId("08321"), "08321");
  });

  it("clears a blank id", () => {
    assert.equal(normalizeStoreId(""), "");
    assert.equal(normalizeStoreId("   "), "");
  });

  it("rejects letters and ids longer than 8 digits", () => {
    assert.equal(normalizeStoreId("store12"), null);
    assert.equal(normalizeStoreId("12-345"), null);
    assert.equal(normalizeStoreId("123456789"), null);
  });
});
