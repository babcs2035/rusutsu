import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_FILTERS } from "@/features/filters/constants";
import { distanceKm } from "../utils/distance";
import {
  type HomeSession,
  homeSessionSchema,
  mapSessionSchema,
  resolveHomeSession,
} from "./storage";

const session: HomeSession = {
  version: 1,
  selectedResortId: "rusutsu",
  selectedFeature: { kind: "course", id: "a" },
  mobileContentTab: "info",
  filters: DEFAULT_FILTERS,
  hasSearched: false,
  isFilterEditorOpen: true,
  isListSheetOpen: false,
  listSheetSnapPoint: 0.5,
};
test("再読み込み時は URL が同じスキー場でも全画面の親タブを保持する", () => {
  assert.equal(
    resolveHomeSession(
      session,
      new URL("https://example.com/rusutsu?resort=rusutsu"),
      new Set(["rusutsu"]),
    )?.mobileContentTab,
    "info",
  );
});
test("別のスキー場への直接リンクを優先し、古いコース選択を持ち越さない", () => {
  const result = resolveHomeSession(
    session,
    new URL("https://example.com/rusutsu?resort=niseko"),
    new Set(["rusutsu", "niseko"]),
  );
  assert.equal(result?.selectedResortId, "niseko");
  assert.equal(result?.selectedFeature, null);
  assert.equal(result?.mobileContentTab, "info");
});
test("削除されたスキー場と破損した保存データは復元しない", () => {
  assert.equal(
    resolveHomeSession(
      session,
      new URL("https://example.com/rusutsu"),
      new Set(),
    )?.selectedResortId,
    null,
  );
  assert.equal(
    homeSessionSchema.safeParse({
      ...session,
      filters: { ...DEFAULT_FILTERS, liftTicket: { party: null } },
    }).success,
    false,
  );
  assert.equal(
    mapSessionSchema.safeParse({
      version: 1,
      viewport: { center: { lat: 999, lng: 1 }, zoom: 13 },
      tileVariant: "pale",
      courseColorMode: "slope",
      showOpenOnly: false,
    }).success,
    false,
  );
});
test("直線距離は同一点でゼロ、日付変更線と対蹠点でも有限", () => {
  const point = { latitude: 42.7, longitude: 140.9 };
  assert.equal(distanceKm(point, point), 0);
  assert.ok(
    Math.abs(
      distanceKm(
        { latitude: 0, longitude: 179 },
        { latitude: 0, longitude: -179 },
      ) - 222.39,
    ) < 0.01,
  );
  assert.ok(
    Math.abs(
      distanceKm(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 180 },
      ) - 20015.114,
    ) < 0.01,
  );
});

test("画面保存はsessionStorageのみを使い、別タブと下書きを変更しない", async t => {
  const { readStorage, writeStorage } = await import("./storage");
  const tabs = [new Map<string, string>(), new Map<string, string>()];
  let active = 0;
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => tabs[active].get(key) ?? null,
      setItem: (key: string, value: string) => tabs[active].set(key, value),
    },
  });
  t.after(() => {
    if (descriptor)
      Object.defineProperty(globalThis, "sessionStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  });
  writeStorage("test", session);
  active = 1;
  assert.equal(readStorage("test", homeSessionSchema), null);
  writeStorage("test", { ...session, selectedResortId: "niseko" });
  active = 0;
  assert.equal(
    readStorage("test", homeSessionSchema)?.selectedResortId,
    "rusutsu",
  );
});
