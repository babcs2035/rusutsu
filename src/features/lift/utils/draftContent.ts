import { draftContentKey } from "@/shared/utils/editorDraft";
import type { EditorLift } from "../types";
import { liftToSavePayload } from "./savePayload";

export const liftDraftContentKey = (lifts: EditorLift[]): string =>
  draftContentKey(lifts.filter(lift => !lift.isDeleted).map(liftToSavePayload));
