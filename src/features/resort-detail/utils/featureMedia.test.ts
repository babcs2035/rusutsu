import assert from "node:assert/strict";
import { test } from "node:test";
import { collectFeatureMedia, httpUrl, youtubeEmbedUrl } from "./featureMedia";

test("YouTube共有URL・Shorts・埋め込みURLを同じ動画へ変換し、開始位置を保つ", () => {
  const expected = "https://www.youtube-nocookie.com/embed/abcdefghijk";
  for (const url of [
    "https://youtu.be/abcdefghijk?si=shared",
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://m.youtube.com/shorts/abcdefghijk",
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
    "https://www.youtube.com/live/abcdefghijk",
  ])
    assert.equal(youtubeEmbedUrl(url), expected);
  assert.equal(
    youtubeEmbedUrl("https://youtu.be/abcdefghijk?t=1m30s"),
    `${expected}?start=90`,
  );
  assert.equal(
    youtubeEmbedUrl("https://www.youtube.com/watch?v=abcdefghijk&t=90"),
    `${expected}?start=90`,
  );
});

test("埋め込み対象を動画URLに限定し、偽装ホストと実行可能URLを除く", () => {
  for (const url of [
    "https://www.youtube.com/@resort",
    "https://www.youtube.com/playlist?list=abcdefghijk",
    "https://youtube.com.example.org/watch?v=abcdefghijk",
    "https://example.org/?v=abcdefghijk",
    "https://youtu.be/invalid",
    "javascript:alert(1)",
    "data:text/html,hello",
  ])
    assert.equal(youtubeEmbedUrl(url), null);
  assert.equal(httpUrl("javascript:alert(1)"), null);
});

test("複数区間で共有する写真と動画を重複表示せず、リフトの動画リンクも扱う", () => {
  assert.deepEqual(
    collectFeatureMedia([
      {
        image: "https://example.com/course.jpg",
        youtubeUrl: "https://youtu.be/abcdefghijk",
      },
      {
        image: "https://example.com/course.jpg",
        link: "https://youtube.com/watch?v=abcdefghijk",
      },
      { image: "javascript:alert(1)", youtubeUrl: null },
    ]),
    {
      images: ["https://example.com/course.jpg"],
      videos: ["https://www.youtube-nocookie.com/embed/abcdefghijk"],
    },
  );
});
