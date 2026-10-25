import { notFound } from "next/navigation";
import { getSkiResortsForMap } from "@/actions/skiResorts";
import { CorrectionForm } from "@/features/corrections/CorrectionForm";
import { safeCorrectionReturnTo } from "@/features/corrections/returnTo";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import { getDataDocument } from "@/server/data-documents/client";
import { featureIdentity } from "@/shared/course-lift/identity";

type Props = {
  params: Promise<{ resortId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const contextValue = (value: string | string[] | undefined) => {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export default async function CorrectionPage({ params, searchParams }: Props) {
  const [{ resortId }, query, resorts, adminResorts] = await Promise.all([
    params,
    searchParams,
    getSkiResortsForMap(),
    readAdminSkiResorts(),
  ]);
  const resort = resorts.find(item => item.id === resortId);
  if (!resort) notFound();
  const [slope, lift] = await Promise.all([
    getDataDocument(`resorts-temporary/slope_before/${resortId}.geojson`),
    getDataDocument(`resorts-temporary/lift_before/${resortId}.geojson`),
  ]);
  const features = [
    ...([slope, lift] as const).flatMap((doc, sourceIndex) => {
      if (!doc) return [];
      try {
        const data = JSON.parse(doc.content) as {
          features?: Array<{
            properties?: Record<string, unknown> | null;
            geometry?: { type?: string; coordinates?: number[][] } | null;
          }>;
        };
        const kind = sourceIndex === 0 ? ("slope" as const) : ("lift" as const);
        const key = `resorts-temporary/${kind === "slope" ? "slope_before" : "lift_before"}/${resortId}.geojson`;
        return (data.features ?? []).flatMap((feature, index) =>
          feature.geometry?.type === "LineString" &&
          Array.isArray(feature.geometry.coordinates)
            ? [
                {
                  id: featureIdentity(feature.properties ?? null, key, index),
                  kind,
                  name:
                    typeof feature.properties?.name === "string"
                      ? feature.properties.name
                      : "名称未設定",
                  properties: Object.fromEntries(
                    [
                      "name",
                      "level",
                      "distance",
                      "avg",
                      "max",
                      "avg_slope_deg_map",
                      "piste",
                      "morning",
                      "night",
                      "pisteSegments",
                      "morningSegments",
                      "nightSegments",
                      "type",
                      "speed",
                      "capacity",
                      "hood",
                      "footrest",
                      "oilShield",
                      "towers",
                      "vertical",
                      "top",
                      "bottom",
                      "maker",
                      "year",
                      "note",
                      "link",
                      "image",
                      "youtubeUrl",
                      "searchWord",
                      "maxWidth",
                      "minWidth",
                      "signal",
                      "morning",
                      "night",
                    ].flatMap(field =>
                      feature.properties?.[field] === undefined
                        ? []
                        : [[field, feature.properties[field]]],
                    ),
                  ),
                  coordinates: feature.geometry.coordinates,
                },
              ]
            : [],
        );
      } catch {
        return [];
      }
    }),
  ];
  const returnTo = safeCorrectionReturnTo(
    typeof query.returnTo === "string" ? query.returnTo : undefined,
    resortId,
  );
  const adminResort = adminResorts.find(value => value.id === resortId);
  const currentValues = adminResort
    ? Object.fromEntries(
        [
          "nameJa",
          "nameEn",
          "shortName",
          "website",
          "descriptionShort",
          "descriptionLong",
          "courseImages",
          "outlineImages",
        ].map(field => [field, adminResort[field as keyof typeof adminResort]]),
      )
    : {};
  return (
    <CorrectionForm
      resortId={resortId}
      resortName={resort.nameJa}
      context={contextValue(query.context)}
      returnTo={returnTo}
      kind={typeof query.kind === "string" ? query.kind : undefined}
      features={features}
      currentValues={currentValues}
      center={[resort.longitude, resort.latitude]}
    />
  );
}
