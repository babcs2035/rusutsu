-- 本番ビルドのブラウザー試験に使う最小データを，使い捨て DB に投入する．
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() !~ '^rusutsu_test_[0-9]+$' THEN
    RAISE EXCEPTION 'Browser fixtures require a disposable Rusutsu test database';
  END IF;
END;
$$;

INSERT INTO ski_resorts (
  id, "nameJa", "nameEn", prefecture, town, latitude, longitude,
  "topElevation", "baseElevation", "verticalDrop", "numberOfCourses",
  "longestCourse", "beginnersCoursesPercent", "intermediateCoursesPercent",
  "advancedCoursesPercent", "numberOfLifts", ropeways, gondolas,
  "quadLifts", "tripleLifts", "pairLifts", "singleLifts", "otherLifts",
  "updatedAt"
) VALUES
  ('rusutsu-resort', 'ルスツ 試験用', 'Rusutsu fixture', '北海道', '留寿都村',
   42.75, 140.91, 900, 500, 400, 1, 500, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, now()),
  ('niseko-test', 'ニセコ 試験用', 'Niseko fixture', '北海道', '倶知安町',
   42.86, 140.70, 900, 500, 400, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, now());

INSERT INTO canonical_data_migrations (key, "sourceHash", details)
VALUES ('map-canonical-v2', repeat('0', 64), '{"test":true}');

INSERT INTO lift_ticket_seasons ("skiResortId", "seasonId", status, data)
VALUES ('rusutsu-resort', '2026-2027', 'complete', '{
  "schema_version": "1.0.0",
  "resort": {"id": "rusutsu-resort"},
  "season": {"id": "2026-2027", "label_ja": "ブラウザー試験シーズン"},
  "audiences": [{"id": "adult", "name_ja": "大人", "is_default": true}],
  "calendars": [],
  "products": [{"id": "day", "name_ja": "試験用1日券", "validity": {"mode": "calendar_day", "days": 1}}],
  "channels": [],
  "offers": [{"id": "day", "name_ja": "試験用窓口料金", "product_id": "day", "audience_ids": ["adult"], "price": {"amount": 4310, "currency": "JPY"}}],
  "party_rules": [],
  "fees": [],
  "data_quality": {"status": "complete"}
}');

INSERT INTO map_courses (
  id, "resortId", "sourceKind", "documentKey", "sourceIndex", name, difficulty,
  properties, geometry, "geometryType", "updatedAt"
) VALUES (
  'browser-test-course', 'rusutsu-resort', 'curated',
  'resorts-temporary/slope_before/rusutsu-resort.geojson', 0, '試験用コース', '初級',
  '{}', '{"type":"LineString","coordinates":[[140.91,42.75,650],[140.911,42.751,700]]}',
  'LineString', now()
);

INSERT INTO users (id, role, "publicName", "nameMode")
VALUES ('browser-test-admin', 'admin', '試験用の投稿者', 'NICKNAME');

INSERT INTO accounts (id, "userId", type, provider, "providerAccountId")
VALUES ('browser-test-account', 'browser-test-admin', 'oauth', 'google', 'browser-test-google');

INSERT INTO community_posts (
  id, "authorId", "resortId", "observedOn", "observedTime", "submissionKey", "updatedAt"
) VALUES (
  'browser-test-post', 'browser-test-admin', 'rusutsu-resort',
  '2026-01-15', '09:30', 'browser-test-submission', now()
);

INSERT INTO community_entries (
  id, "postId", "clientKey", position, kind, "courseId", "targetName", body, status
) VALUES (
  'browser-test-entry', 'browser-test-post', 'browser-test-entry', 0, 'COURSE',
  'browser-test-course', '試験用コース', '試験用の現地レポート本文', 'オープン'
);

INSERT INTO contribution_photos (
  id, "postId", "entryId", "ownerId", bytes, "thumbBytes", "mimeType", width, height
) SELECT 'browsertestphoto000001', 'browser-test-post', 'browser-test-entry',
  'browser-test-admin', photo, photo, 'image/webp', 16, 16
FROM (
  SELECT decode('UklGRjIAAABXRUJQVlA4ICYAAACQAQCdASoQABAAAUAmJQBOl0AAhgAA/u5eP4tikNzPiF3sYUAAAA==', 'base64') AS photo
) image;

INSERT INTO crawl_latest_runs (
  id, "producerId", "idempotencyKey", "skiResortId", "observedAt",
  "completedAt", "schemaVersion", "requestHash", outcome
) VALUES (
  'browser-test-run', 'browser-test', 'browser-test-run', 'rusutsu-resort',
  '2026-01-15 09:30+09', '2026-01-15 09:31+09', 1, repeat('1', 64), 'SUCCESS'
);

INSERT INTO crawl_latest_category_snapshots (
  id, "runId", "skiResortId", kind, state, "validationState",
  "eligibleForCurrent", "sourceUrls", "itemCount", "usableItemCount"
) VALUES (
  'browser-test-comment', 'browser-test-run', 'rusutsu-resort',
  'COMMENT', 'EMPTY', 'VALID', true, ARRAY[]::text[], 0, 0
);

INSERT INTO crawl_latest_currents ("skiResortId", kind, "snapshotId", "updatedAt")
VALUES ('rusutsu-resort', 'COMMENT', 'browser-test-comment', now());

INSERT INTO data_documents (key, content, "mediaType", hash, version)
SELECT 'test/browser-fixture.json', content, 'application/json',
  encode(sha256(convert_to(content, 'UTF8')), 'hex'), 7
FROM (SELECT '{"unknown": null, "order": 1}' AS content) document;

INSERT INTO data_documents (key, content, "mediaType", hash, version)
SELECT 'SkiResortLinks.json', content, 'application/json',
  encode(sha256(convert_to(content, 'UTF8')), 'hex'), 1
FROM (
  SELECT '{
    "rusutsu-resort": {
      "tenkijpUrls": [{"url":"https://tenki.jp/season/ski/1/2/3/"}],
      "snowForecastUrls": [{"url":"https://ja.snow-forecast.com/resorts/Rusutsu/6day/mid"}],
      "weathernewsUrls": [{"url":"https://weathernews.jp/ski/spot/1/"}]
    }
  }' AS content
) weather;

COMMIT;
