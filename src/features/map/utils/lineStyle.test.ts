import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  FinalizedFeatureStatus,
  FinalizedLineFeature,
  SelectedMapFeature,
} from "../types";
import {
  getLineStyle,
  getMapCasingWidth,
  getMapLineWidth,
  type LineStyleContext,
} from "./lineStyle";

const createFeature = ({
  kind = "course",
  sourceId = "course-a",
  color = "#22C55E",
  statusKind = "open",
  ungroomed = false,
  flowColor,
  flowSpeed,
}: {
  kind?: "course" | "lift";
  sourceId?: string;
  color?: string;
  statusKind?: FinalizedFeatureStatus;
  ungroomed?: boolean;
  flowColor?: string;
  flowSpeed?: "slow" | "normal" | "fast";
} = {}): FinalizedLineFeature => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates: [] },
  properties: {
    id: `${sourceId}-1`,
    kind,
    sourceId,
    color,
    statusKind,
    ungroomed,
    segmented: false,
    flowColor,
    flowSpeed,
  },
});

const createContext = (
  overrides: Partial<LineStyleContext> = {},
): LineStyleContext => ({
  zoom: 16,
  courseColorMode: "difficulty",
  mapTileVariant: "pale",
  isFocusMode: false,
  showOpenOnly: false,
  selectedFeature: null,
  ...overrides,
});

const styleOf = (
  feature: FinalizedLineFeature,
  variant: "casing" | "line" | "flow" | "hit",
  context: LineStyleContext = createContext(),
) =>
  getLineStyle({
    feature,
    featureKind: feature.properties.kind,
    variant,
    hitWeight: 24,
    context,
  });

test("線幅テーブルはズームで補間し、範囲外は端で止まる", () => {
  assert.equal(getMapLineWidth(16, "course"), 4.4);
  assert.equal(getMapLineWidth(15.5, "course"), 4);
  assert.equal(getMapLineWidth(9, "course"), 2);
  assert.equal(getMapLineWidth(22, "course"), 6);
  // リフトはコースよりやや細い
  assert.ok(getMapLineWidth(16, "lift") < getMapLineWidth(16, "course"));
});

test("ケーシングは線幅に比例し、白が線を飲み込まない", () => {
  const thin = getMapCasingWidth(0.9, false);
  const thick = getMapCasingWidth(6, false);
  // 旧実装は固定 +3.4px で、細い線ではケーシングが 4 倍以上あった
  assert.ok(thin / 0.9 < 2.4);
  assert.ok(thick > 6);
  assert.ok(thick - 6 <= 1.8);
  assert.ok(getMapCasingWidth(2, true) > getMapCasingWidth(2, false));
});

test("営業中のコースは自分の色・ケーシングつき", () => {
  const line = styleOf(createFeature(), "line");
  const casing = styleOf(createFeature(), "casing");

  assert.equal(line.color, "#22C55E");
  assert.equal(line.opacity, 1);
  assert.equal(line.dashArray, undefined);
  assert.equal(casing.color, "#FFFFFF");
  assert.ok((casing.weight ?? 0) > (line.weight ?? 0));
});

test("通常表示では営業状態で見た目を変えない", () => {
  const open = styleOf(createFeature(), "line");
  const closed = styleOf(createFeature({ statusKind: "closed" }), "line");
  const limited = styleOf(createFeature({ statusKind: "limited" }), "line");

  assert.equal(closed.color, open.color);
  assert.equal(closed.opacity, open.opacity);
  assert.equal(closed.weight, open.weight);
  assert.equal(limited.opacity, open.opacity);
  // ケーシングも同じ
  assert.equal(
    styleOf(createFeature({ statusKind: "closed" }), "casing").opacity,
    styleOf(createFeature(), "casing").opacity,
  );
});

test("非圧雪は総幅を変えずに芯線を破線にする", () => {
  const groomed = styleOf(createFeature(), "line");
  const ungroomed = styleOf(createFeature({ ungroomed: true }), "line");

  assert.equal(groomed.dashArray, undefined);
  assert.ok(typeof ungroomed.dashArray === "string");
  assert.equal(ungroomed.weight, groomed.weight);
  // ケーシング側は実線のまま（幅も同じ）
  assert.equal(
    styleOf(createFeature({ ungroomed: true }), "casing").dashArray,
    undefined,
  );
});

test("営業中のみ ON で、営業中を濃く太く・それ以外をはっきり薄くする", () => {
  const context = createContext({ showOpenOnly: true });
  const openLine = styleOf(createFeature(), "line", context);
  const closedLine = styleOf(
    createFeature({ statusKind: "closed" }),
    "line",
    context,
  );
  const closedCasing = styleOf(
    createFeature({ statusKind: "closed" }),
    "casing",
    context,
  );

  // 営業中は通常より少し太い
  assert.ok(
    (openLine.weight ?? 0) > (styleOf(createFeature(), "line").weight ?? 0),
  );
  assert.equal(openLine.opacity, 1);

  // 非営業は色を保ったままはっきり薄く・細く、白ケーシングは外す
  assert.equal(closedLine.color, "#22C55E");
  assert.ok((closedLine.opacity ?? 1) <= 0.25);
  assert.ok((closedLine.weight ?? 0) < (openLine.weight ?? 0));
  assert.equal(closedCasing.weight, 0);
});

test("一部運休のリフトは流れる破線ではなく赤い点滅にする", () => {
  const limitedLift = createFeature({
    kind: "lift",
    sourceId: "lift-3",
    statusKind: "limited",
    flowColor: "#FED7AA",
  });

  // 流れる破線は運行中だけ
  assert.equal(styleOf(limitedLift, "flow").weight, 0);
  // 線本体に点滅クラスが付く
  assert.ok(
    styleOf(limitedLift, "line").className?.includes("finalized-lift-blink"),
  );
  // 営業中のリフトは点滅しない
  assert.equal(
    styleOf(
      createFeature({ kind: "lift", sourceId: "lift-1" }),
      "line",
    ).className?.includes("finalized-lift-blink"),
    false,
  );
});

test("営業中のリフトはフローが流れ、運休リフトは止まる", () => {
  const openLift = createFeature({
    kind: "lift",
    sourceId: "lift-1",
    statusKind: "open",
    color: "#1E40AF",
    flowColor: "#7FE3F5",
    flowSpeed: "fast",
  });
  const closedLift = createFeature({
    kind: "lift",
    sourceId: "lift-2",
    statusKind: "closed",
    color: "#8A99A8",
    flowColor: "#FFFFFF",
  });

  const openFlow = styleOf(openLift, "flow");
  assert.equal(openFlow.color, "#7FE3F5");
  assert.ok(typeof openFlow.dashArray === "string");
  assert.ok((openFlow.weight ?? 0) > 0);
  assert.ok(openFlow.className?.includes("finalized-lift-flow-fast"));

  const closedFlow = styleOf(closedLift, "flow");
  assert.equal(closedFlow.weight, 0);
  // className は非表示でも付ける（Leaflet は生成時にしか適用しない）
  assert.ok(closedFlow.className?.includes("finalized-lift-flow"));
});

test("フローは営業中より細く、リフト線の縁が残る", () => {
  const openLift = createFeature({
    kind: "lift",
    sourceId: "lift-1",
    statusKind: "open",
    flowColor: "#7FE3F5",
  });

  assert.ok(
    (styleOf(openLift, "flow").weight ?? 0) <
      (styleOf(openLift, "line").weight ?? 0),
  );
});

test("選択中は太く、非選択は灰色に沈む", () => {
  const selected: SelectedMapFeature = { kind: "course", id: "course-a" };
  const context = createContext({ selectedFeature: selected });
  const selectedLine = styleOf(createFeature(), "line", context);
  const otherLine = styleOf(
    createFeature({ sourceId: "course-b" }),
    "line",
    context,
  );

  assert.equal(selectedLine.opacity, 1);
  assert.ok((selectedLine.weight ?? 0) > (otherLine.weight ?? 0));
  assert.equal(otherLine.color, "#94A3B8");
  assert.ok((otherLine.opacity ?? 1) < 0.5);
});

test("選択中は営業中のみ ON でも薄くならない", () => {
  const context = createContext({
    showOpenOnly: true,
    selectedFeature: { kind: "course", id: "course-a" },
  });
  const line = styleOf(
    createFeature({ statusKind: "closed" }),
    "line",
    context,
  );

  assert.equal(line.opacity, 1);
  assert.ok((line.weight ?? 0) > 1);
});

test("ヒット領域は透明でポインタ種別ぶんの太さを持つ", () => {
  const hit = styleOf(createFeature(), "hit");
  assert.equal(hit.opacity, 0);
  assert.equal(hit.weight, 24);
});
