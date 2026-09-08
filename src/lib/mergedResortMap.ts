import type {
  FinalizedCourseFeature,
  FinalizedLiftFeature,
  FinalizedResortMapData,
  ResortMapSection,
} from "./finalizedResortGeojson";

/** 元スキー場の名前が同じでも、コース・リフトを取り違えない。 */
export function mergeResortMapSections<
  T extends FinalizedCourseFeature | FinalizedLiftFeature,
>(
  sections: { id: string; section: ResortMapSection<T> | null }[],
): ResortMapSection<T> | null {
  const available = sections.filter(
    (entry): entry is { id: string; section: ResortMapSection<T> } =>
      entry.section !== null,
  );
  if (!available.length) return null;
  return {
    source: "mixed",
    baseSource: "mixed",
    fileName: available.map(entry => entry.section.fileName).join(", "),
    sourceUrls: [
      ...new Set(available.flatMap(entry => entry.section.sourceUrls)),
    ],
    verificationStatus: available.every(
      entry => entry.section.verificationStatus === "verified",
    )
      ? "verified"
      : "mixed",
    features: available.flatMap(({ id, section }) =>
      section.features.map(feature => ({
        ...feature,
        id: `${id}:${feature.id}`,
        ...("groupId" in feature
          ? { groupId: `${id}:${feature.groupId}` }
          : {}),
      })),
    ),
  };
}

export function mergeResortMaps(
  entries: { id: string; data: FinalizedResortMapData | null }[],
): FinalizedResortMapData | null {
  const courses = mergeResortMapSections(
    entries.map(({ id, data }) => ({ id, section: data?.courses ?? null })),
  );
  const lifts = mergeResortMapSections(
    entries.map(({ id, data }) => ({ id, section: data?.lifts ?? null })),
  );
  return courses || lifts ? { courses, lifts } : null;
}
