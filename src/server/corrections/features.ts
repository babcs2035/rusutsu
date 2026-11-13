import { getDataDocument } from "@/server/data-documents/client";
import { featureIdentity } from "@/shared/course-lift/identity";

/** 修正画面に渡す項目。公開の地図と詳細に出ているものだけに絞る */
const FEATURE_FIELDS = [
  "name",
  "level",
  "piste",
  "morning",
  "night",
  "pisteSegments",
  "morningSegments",
  "nightSegments",
  "type",
  "speed",
  "hood",
  "footrest",
  "oilShield",
  "towers",
  "maker",
  "year",
] as const;

export type CorrectionFeature = {
  id: string;
  kind: "slope" | "lift";
  name: string;
  coordinates: [number, number][];
  properties: Record<string, unknown>;
};

const documentKey = (kind: "slope" | "lift", resortId: string) =>
  `resorts-temporary/${kind === "slope" ? "slope_before" : "lift_before"}/${resortId}.geojson`;

/**
 * 修正の対象になるコース・リフトの線を、正本（編集前のGeoJSON）から読む。
 * 送信時と承認時は同じ文書の同じIDで照合するので、公開用に加工した地図データは使わない。
 */
export async function readCorrectionFeatures(
  resortId: string,
): Promise<CorrectionFeature[]> {
  const kinds = ["slope", "lift"] as const;
  const documents = await Promise.all(
    kinds.map(kind => getDataDocument(documentKey(kind, resortId))),
  );
  return kinds.flatMap((kind, kindIndex) => {
    const document = documents[kindIndex];
    if (!document) return [];
    const key = documentKey(kind, resortId);
    try {
      const data = JSON.parse(document.content) as {
        features?: Array<{
          properties?: Record<string, unknown> | null;
          geometry?: { type?: string; coordinates?: unknown } | null;
        }>;
      };
      return (data.features ?? []).flatMap((feature, index) => {
        const coordinates = feature.geometry?.coordinates;
        if (
          feature.geometry?.type !== "LineString" ||
          !Array.isArray(coordinates)
        )
          return [];
        const points = coordinates.flatMap(point =>
          Array.isArray(point) &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1])
            ? [[Number(point[0]), Number(point[1])] as [number, number]]
            : [],
        );
        if (points.length < 2) return [];
        const properties = feature.properties ?? null;
        return [
          {
            id: featureIdentity(properties, key, index),
            kind,
            name:
              typeof properties?.name === "string" && properties.name
                ? properties.name
                : "名称未設定",
            coordinates: points,
            properties: Object.fromEntries(
              FEATURE_FIELDS.flatMap(field =>
                properties?.[field] === undefined
                  ? []
                  : [[field, properties[field]]],
              ),
            ),
          },
        ];
      });
    } catch {
      return [];
    }
  });
}
