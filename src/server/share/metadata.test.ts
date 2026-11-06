import assert from "node:assert/strict";
import { test } from "node:test";
import { createShareMetadata } from "./metadata";

const resorts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `resort-${i + 1}`,
    nameJa: `スキー場${i + 1}`,
  }));

test("single resort metadata uses absolute basePath canonical and image URLs", () => {
  const metadata = createShareMetadata(resorts(1));
  assert.equal(
    metadata.alternates?.canonical,
    "https://ktak.dev/rusutsu/resort-1",
  );
  assert.ok(Array.isArray(metadata.openGraph?.images));
  assert.ok(Array.isArray(metadata.twitter?.images));
  const image = metadata.openGraph.images[0];
  assert.ok(image);
  const url = new URL(
    typeof image === "string" || image instanceof URL ? image : image.url,
  );
  assert.equal(url.origin, "https://ktak.dev");
  assert.equal(url.pathname, "/rusutsu/api/share-image");
  assert.equal(url.searchParams.get("ids"), "resort-1");
  assert.equal(url.searchParams.get("count"), "1");
  assert.equal(metadata.twitter.images[0], image);
  assert.equal(metadata.openGraph.images.length, 1);
});

test("comparison canonical retains every ordered ID while image is capped at four", () => {
  const metadata = createShareMetadata(resorts(6), true);
  const canonical = new URL(String(metadata.alternates?.canonical));
  assert.equal(
    canonical.searchParams.get("compare"),
    "resort-1,resort-2,resort-3,resort-4,resort-5,resort-6",
  );
  assert.ok(Array.isArray(metadata.openGraph?.images));
  const image = metadata.openGraph.images[0];
  assert.ok(image);
  const imageUrl = new URL(
    typeof image === "string" || image instanceof URL ? image : image.url,
  );
  assert.equal(
    imageUrl.searchParams.get("ids"),
    "resort-1,resort-2,resort-3,resort-4",
  );
  assert.equal(imageUrl.searchParams.get("count"), "6");
  assert.equal(imageUrl.searchParams.get("comparison"), "1");
  assert.equal(
    metadata.title,
    "スキー場1・スキー場2・スキー場3・スキー場4 ほか2件の比較",
  );
  assert.equal(metadata.openGraph.images.length, 1);
});

test("empty resort list returns no metadata", () => {
  assert.deepEqual(createShareMetadata([]), {});
});
