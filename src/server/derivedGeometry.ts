import { createHash } from "node:crypto";

type Position2d = [number, number];

export type LineGeojsonFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
};

export type LineGeojsonFeatureCollection<
  TFeature extends LineGeojsonFeature = LineGeojsonFeature,
> = {
  type: "FeatureCollection";
  features: TFeature[];
};

type DerivedGeometryKind = "slope" | "lift";

type SynchronizeDerivedGeometryInput<TFeature extends LineGeojsonFeature> = {
  previousBefore: LineGeojsonFeatureCollection<TFeature> | null;
  nextBefore: LineGeojsonFeatureCollection<TFeature>;
  existingDerived: LineGeojsonFeatureCollection<TFeature> | null;
  intervalM: number;
  kind: DerivedGeometryKind;
};

const EARTH_RADIUS_M = 6_371_000;
const SOURCE_LINE_HASH_PROPERTY = "_source_line_sha256";
const DERIVED_METRIC_KEYS = [
  "horizontal_dist",
  "horizontal_dist_map",
  "slope_dist",
  "slope_dist_map",
  "elevation_diff",
  "elevation_diff_map",
  "avg_slope_deg_map",
  "max_slope_deg_map",
  "slope_deg",
  SOURCE_LINE_HASH_PROPERTY,
] as const;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const distanceM = (a: Position2d, b: Position2d): number => {
  const latitudeDelta = toRadians(b[1] - a[1]);
  const longitudeDelta = toRadians(b[0] - a[0]);
  const latitudeA = toRadians(a[1]);
  const latitudeB = toRadians(b[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine));
};

const asPosition2d = (value: unknown): Position2d | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
};

const lineCoordinates2d = (
  feature: LineGeojsonFeature,
): Position2d[] | null => {
  if (
    feature.geometry?.type !== "LineString" ||
    !Array.isArray(feature.geometry.coordinates)
  ) {
    return null;
  }
  const coordinates = feature.geometry.coordinates.map(asPosition2d);
  return coordinates.length >= 2 && coordinates.every(Boolean)
    ? (coordinates as Position2d[])
    : null;
};

const samePosition2d = (left: unknown, right: unknown): boolean => {
  const leftPosition = asPosition2d(left);
  const rightPosition = asPosition2d(right);
  if (!leftPosition || !rightPosition) return left === right;
  return (
    leftPosition[0] === rightPosition[0] && leftPosition[1] === rightPosition[1]
  );
};

const sameLineCoordinates = (
  left: LineGeojsonFeature,
  right: LineGeojsonFeature,
): boolean => {
  const leftCoordinates = lineCoordinates2d(left);
  const rightCoordinates = lineCoordinates2d(right);
  return (
    leftCoordinates !== null &&
    rightCoordinates !== null &&
    leftCoordinates.length === rightCoordinates.length &&
    leftCoordinates.every(
      (coordinate, index) =>
        coordinate[0] === rightCoordinates[index]?.[0] &&
        coordinate[1] === rightCoordinates[index]?.[1],
    )
  );
};

const sourceLineHash = (coordinates: readonly Position2d[]): string =>
  createHash("sha256").update(JSON.stringify(coordinates)).digest("hex");

const pointToSegmentDistanceM = (
  point: Position2d,
  start: Position2d,
  end: Position2d,
): number => {
  const referenceLatitude = toRadians((point[1] + start[1] + end[1]) / 3);
  const project = (position: Position2d): Position2d => [
    EARTH_RADIUS_M * toRadians(position[0]) * Math.cos(referenceLatitude),
    EARTH_RADIUS_M * toRadians(position[1]),
  ];
  const [pointX, pointY] = project(point);
  const [startX, startY] = project(start);
  const [endX, endY] = project(end);
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const squaredLength = deltaX ** 2 + deltaY ** 2;
  if (squaredLength === 0) return Math.hypot(pointX - startX, pointY - startY);
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / squaredLength,
    ),
  );
  return Math.hypot(
    pointX - (startX + ratio * deltaX),
    pointY - (startY + ratio * deltaY),
  );
};

const pointToLineDistanceM = (
  point: Position2d,
  line: readonly Position2d[],
): number => {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    if (start && end) {
      minimum = Math.min(minimum, pointToSegmentDistanceM(point, start, end));
    }
  }
  return minimum;
};

const totalLineDistanceM = (coordinates: readonly Position2d[]): number =>
  coordinates.slice(1).reduce((total, coordinate, index) => {
    const previous = coordinates[index];
    return previous ? total + distanceM(previous, coordinate) : total;
  }, 0);

const derivedGeometryRepresentsSource = (
  sourceCoordinates: readonly Position2d[],
  derivedFeature: LineGeojsonFeature,
  intervalM: number,
): boolean => {
  const derivedCoordinates = lineCoordinates2d(derivedFeature);
  if (!derivedCoordinates) return false;

  const storedHash = normalizeIdentity(
    derivedFeature.properties?.[SOURCE_LINE_HASH_PROPERTY],
  );
  if (storedHash && storedHash !== sourceLineHash(sourceCoordinates)) {
    return false;
  }

  const firstSource = sourceCoordinates[0];
  const lastSource = sourceCoordinates.at(-1);
  const firstDerived = derivedCoordinates[0];
  const lastDerived = derivedCoordinates.at(-1);
  if (!firstSource || !lastSource || !firstDerived || !lastDerived)
    return false;
  if (
    distanceM(firstSource, firstDerived) > 0.5 ||
    distanceM(lastSource, lastDerived) > 0.5 ||
    derivedCoordinates.some(
      coordinate => pointToLineDistanceM(coordinate, sourceCoordinates) > 0.5,
    ) ||
    sourceCoordinates.some(
      coordinate =>
        pointToLineDistanceM(coordinate, derivedCoordinates) > intervalM + 0.5,
    )
  ) {
    return false;
  }

  const horizontalDistance = Number(
    derivedFeature.properties?.horizontal_dist_map,
  );
  if (Number.isFinite(horizontalDistance)) {
    const sourceDistance = totalLineDistanceM(sourceCoordinates);
    return (
      Math.abs(horizontalDistance - sourceDistance) <=
      Math.max(2, sourceDistance * 0.005)
    );
  }
  return true;
};

const normalizeIdentity = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
};

type FeatureLookup<TFeature extends LineGeojsonFeature> = {
  byId: ReadonlyMap<string, readonly TFeature[]>;
  byName: ReadonlyMap<string, readonly TFeature[]>;
};

const createFeatureLookup = <TFeature extends LineGeojsonFeature>(
  features: readonly TFeature[],
): FeatureLookup<TFeature> => {
  const byId = new Map<string, TFeature[]>();
  const byName = new Map<string, TFeature[]>();
  for (const feature of features) {
    const id = normalizeIdentity(feature.properties?.["@id"]);
    const name = normalizeIdentity(feature.properties?.name);
    if (id) byId.set(id, [...(byId.get(id) ?? []), feature]);
    if (name) byName.set(name, [...(byName.get(name) ?? []), feature]);
  }
  return { byId, byName };
};

/**
 * @id を優先し、無ければ名前で照合する。重複や識別子同士の食い違いが
 * ある場合は、別の線の標高を引き継がないよう照合失敗として扱う。
 */
const findSafeMatch = <TFeature extends LineGeojsonFeature>(
  feature: LineGeojsonFeature,
  lookup: FeatureLookup<TFeature>,
): TFeature | null => {
  const id = normalizeIdentity(feature.properties?.["@id"]);
  const name = normalizeIdentity(feature.properties?.name);
  const idMatches = id ? (lookup.byId.get(id) ?? []) : [];
  const nameMatches = name ? (lookup.byName.get(name) ?? []) : [];

  if (idMatches.length > 1) return null;
  if (idMatches.length === 1) {
    if (nameMatches.length === 1 && nameMatches[0] !== idMatches[0]) {
      return null;
    }
    return idMatches[0] ?? null;
  }
  if (id) {
    const nameMatch = nameMatches.length === 1 ? nameMatches[0] : null;
    return nameMatch && !normalizeIdentity(nameMatch.properties?.["@id"])
      ? nameMatch
      : null;
  }
  return nameMatches.length === 1 ? (nameMatches[0] ?? null) : null;
};

const resampleLineEvery = (
  coordinates: readonly Position2d[],
  intervalM: number,
): { coordinates: Position2d[]; horizontalDistanceM: number } => {
  if (!Number.isFinite(intervalM) || intervalM <= 0) {
    throw new Error("サンプリング間隔は0より大きい有限値が必要です。");
  }
  const first = coordinates[0];
  if (!first || coordinates.length < 2) {
    return {
      coordinates: first ? [[...first]] : [],
      horizontalDistanceM: 0,
    };
  }

  const sampled: Position2d[] = [[...first]];
  let traversedM = 0;
  let nextTargetM = intervalM;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    if (!start || !end) continue;
    const segmentM = distanceM(start, end);
    if (segmentM === 0) continue;

    while (traversedM + segmentM >= nextTargetM) {
      const ratio = (nextTargetM - traversedM) / segmentM;
      sampled.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ]);
      nextTargetM += intervalM;
    }
    traversedM += segmentM;
  }

  const last = coordinates.at(-1);
  const sampledLast = sampled.at(-1);
  if (
    last &&
    sampledLast &&
    (sampled.length === 1 ||
      sampledLast[0] !== last[0] ||
      sampledLast[1] !== last[1])
  ) {
    sampled.push([...last]);
  }
  return { coordinates: sampled, horizontalDistanceM: traversedM };
};

const propertiesForResampledLine = (
  feature: LineGeojsonFeature,
  sourceCoordinates: readonly Position2d[],
  horizontalDistanceM: number,
): Record<string, unknown> => {
  const properties = { ...(feature.properties ?? {}) };
  for (const key of DERIVED_METRIC_KEYS) delete properties[key];
  properties.horizontal_dist_map = Math.round(horizontalDistanceM);
  properties[SOURCE_LINE_HASH_PROPERTY] = sourceLineHash(sourceCoordinates);
  return properties;
};

const propertiesForPreservedLine = (
  previousBefore: LineGeojsonFeature,
  nextBefore: LineGeojsonFeature,
  existingDerived: LineGeojsonFeature,
  kind: DerivedGeometryKind,
  sourceCoordinates: readonly Position2d[],
): Record<string, unknown> => {
  const properties = {
    ...(existingDerived.properties ?? {}),
    ...(nextBefore.properties ?? {}),
  };
  for (const key of DERIVED_METRIC_KEYS) {
    if (Object.hasOwn(existingDerived.properties ?? {}, key)) {
      properties[key] = existingDerived.properties?.[key];
    }
  }
  properties[SOURCE_LINE_HASH_PROPERTY] = sourceLineHash(sourceCoordinates);

  // lift_20m の midstation には標高が付いていることがある。水平位置が
  // 変わっていない場合だけ、その3次元値を維持する。
  if (
    kind === "lift" &&
    asPosition2d(nextBefore.properties?.midstation) !== null &&
    samePosition2d(
      previousBefore.properties?.midstation,
      nextBefore.properties?.midstation,
    ) &&
    Object.hasOwn(existingDerived.properties ?? {}, "midstation")
  ) {
    properties.midstation = existingDerived.properties?.midstation;
  }
  return properties;
};

/**
 * 編集用 *_before と、公開画面が優先して読む resample 済みGeoJSONを同期する。
 *
 * - 元の2D線が不変なら既存の標高付き線・計算値を維持する。
 * - 変更・新規線は外部APIを使わず2Dで再サンプリングし、標高依存値は付けない。
 * - 出力順と存在するfeatureは常に nextBefore に合わせる。
 */
export const synchronizeDerivedGeometry = <
  TFeature extends LineGeojsonFeature,
>({
  previousBefore,
  nextBefore,
  existingDerived,
  intervalM,
  kind,
}: SynchronizeDerivedGeometryInput<TFeature>): LineGeojsonFeatureCollection<TFeature> => {
  if (!Number.isFinite(intervalM) || intervalM <= 0) {
    throw new Error("サンプリング間隔は0より大きい有限値が必要です。");
  }
  const previousFeatures = previousBefore?.features ?? [];
  const derivedFeatures = existingDerived?.features ?? [];
  const previousLookup = createFeatureLookup(previousFeatures);
  const derivedLookup = createFeatureLookup(derivedFeatures);

  const candidatePrevious = nextBefore.features.map(feature =>
    findSafeMatch(feature, previousLookup),
  );
  const previousClaimCount = new Map<TFeature, number>();
  for (const candidate of candidatePrevious) {
    if (candidate) {
      previousClaimCount.set(
        candidate,
        (previousClaimCount.get(candidate) ?? 0) + 1,
      );
    }
  }

  const candidates = nextBefore.features.map((feature, index) => {
    const previous = candidatePrevious[index] ?? null;
    if (
      !previous ||
      previousClaimCount.get(previous) !== 1 ||
      !sameLineCoordinates(previous, feature)
    ) {
      return { feature, previous: null, derived: null };
    }
    return {
      feature,
      previous,
      derived: findSafeMatch(previous, derivedLookup),
    };
  });
  const derivedClaimCount = new Map<TFeature, number>();
  for (const candidate of candidates) {
    if (candidate.derived) {
      derivedClaimCount.set(
        candidate.derived,
        (derivedClaimCount.get(candidate.derived) ?? 0) + 1,
      );
    }
  }

  const features = candidates.flatMap(({ feature, previous, derived }) => {
    const sourceCoordinates = lineCoordinates2d(feature);
    if (!sourceCoordinates) return [];

    const derivedCoordinates = derived ? lineCoordinates2d(derived) : null;
    if (
      previous &&
      derived &&
      derivedClaimCount.get(derived) === 1 &&
      derivedCoordinates &&
      derivedGeometryRepresentsSource(sourceCoordinates, derived, intervalM)
    ) {
      return [
        {
          ...derived,
          type: "Feature" as const,
          properties: propertiesForPreservedLine(
            previous,
            feature,
            derived,
            kind,
            sourceCoordinates,
          ),
        } as TFeature,
      ];
    }

    const sampled = resampleLineEvery(sourceCoordinates, intervalM);
    return [
      {
        type: "Feature" as const,
        properties: propertiesForResampledLine(
          feature,
          sourceCoordinates,
          sampled.horizontalDistanceM,
        ),
        geometry: {
          type: "LineString",
          coordinates: sampled.coordinates,
        },
      } as TFeature,
    ];
  });

  return { type: "FeatureCollection", features };
};
