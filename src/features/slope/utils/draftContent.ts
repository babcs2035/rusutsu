import { draftContentKey } from "@/shared/utils/editorDraft";
import type {
  EditorCourse,
  SlopeBeforeFeature,
  SlopeDetailEntry,
} from "../types";

export const slopeDraftContentKey = (
  courses: EditorCourse[],
  preservedFeatures: SlopeBeforeFeature[],
  preservedDetails: SlopeDetailEntry[],
): string =>
  draftContentKey({
    courses: courses.map(course => ({
      skiId: course.skiId,
      name: course.name,
      coordinates: course.coordinates,
      detail: course.detail,
      beforeExtras: course.beforeExtras ?? {},
      detailExtras: course.detailExtras ?? null,
    })),
    preservedFeatures,
    preservedDetails,
  });
