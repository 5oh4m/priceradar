import test from "node:test";
import assert from "node:assert/strict";
import { parseQueryIntent } from "../src/services/queryIntent.js";
import { normalizeTitle } from "../src/services/titleNormalizer.js";
import { attrsConflict } from "../src/services/attrs.js";

test("storage is normalised from every spelling", () => {
  for (const q of ["iphone 15 256 gb", "iphone 15 256gb", "iphone 15 256 gb storage"]) {
    assert.equal(parseQueryIntent(q).attrs.storage_gb, 256, q);
  }
});

test("1 TB query normalises to 1024 GB", () => {
  assert.equal(parseQueryIntent("macbook air 1tb").attrs.storage_gb, 1024);
});

test("RAM and storage are separated when both are present", () => {
  const a = parseQueryIntent("galaxy s24 8gb ram 256gb").attrs;
  assert.equal(a.ram_gb, 8);
  assert.equal(a.storage_gb, 256);
});

test("brand + colour + connectivity are detected", () => {
  const i = parseQueryIntent("oneplus 12r 5g glacial white");
  assert.equal(i.brand, "oneplus");
  assert.equal(i.attrs.connectivity, "5g");
  assert.equal(i.attrs.color, "white");
});

test("title normalizer strips noise and still extracts attributes", () => {
  const n = normalizeTitle("Apple iPhone 15 (256 GB) - Black (Renewed) - Latest Model");
  assert.equal(n.brand, "apple");
  assert.equal(n.slug, "iphone-15");
  assert.equal(n.attrs.storage_gb, 256);
  assert.equal(n.attrs.color, "black");
  assert.equal(n.attrs.refurbished, true);
});

test("hard gate reports the first conflicting attribute", () => {
  const intent = parseQueryIntent("iphone 15 256 gb").attrs;
  const title = normalizeTitle("APPLE iPhone 15 128 GB Green").attrs;
  assert.equal(attrsConflict(intent, title), "storage_gb");

  const ok = normalizeTitle("Apple iPhone 15 256GB Blue").attrs;
  assert.equal(attrsConflict(intent, ok), null);
});
