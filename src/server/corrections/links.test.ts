import assert from "node:assert/strict";
import test from "node:test";
import { patchLinksDocument } from "@/features/links/model";
import {
  correctionLinkPlatform,
  correctionLinks,
  validateCorrectionLinks,
} from "./links";

test("related-link proposals validate categories and preserve unrelated official fields", () => {
  const content = JSON.stringify({
    test: {
      mapUrls: [{ url: "https://example.com/old" }],
      websiteUrls: [{ url: "https://example.com" }],
    },
    other: { mapUrls: [{ url: "https://other.example/map" }] },
  });
  const before = correctionLinks(content, "test", "links:mapUrls");
  const request = validateCorrectionLinks("test", "links:mapUrls", [], before);
  const changed = JSON.parse(patchLinksDocument(content, request));
  assert.deepEqual(changed.test.mapUrls, []);
  assert.deepEqual(changed.other, JSON.parse(content).other);
  assert.deepEqual(
    changed.test.websiteUrls,
    JSON.parse(content).test.websiteUrls,
  );
  assert.throws(() =>
    patchLinksDocument(
      JSON.stringify({ ...JSON.parse(content), test: { mapUrls: [] } }),
      request,
    ),
  );
  assert.equal(correctionLinkPlatform("status"), null);
  assert.throws(() =>
    validateCorrectionLinks("test", "links:instagramUrls", [
      { url: "https://wrong.example/account" },
    ]),
  );
});
