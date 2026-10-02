"use server";

import path from "node:path";
import {
  readMappingCrawlLatestStatus,
  readMappingStatusHistory,
} from "@/lib/crawlLatestCurrent";
import { requireEditor } from "@/lib/requireEditor";
import { runEdit } from "@/server/edit-requests/workflow";
import {
  loadLatestStatusMappingWorkspace,
  saveLatestStatusMappingFile,
} from "./server/mappingFiles";
import type {
  LatestStatusMappingKind,
  LatestStatusMappingWorkspace,
  SaveLatestStatusMappingRequest,
  SaveLatestStatusMappingResult,
} from "./types";

const TEMPORARY_ROOT = path.join(
  process.cwd(),
  "src",
  "private",
  "data",
  "resorts-temporary",
);

const loadCanonicalLatestStatus = readMappingCrawlLatestStatus;

export const loadLatestStatusMapping = async (
  resortId: string,
  kind: LatestStatusMappingKind,
  geojsonNames?: string[],
): Promise<LatestStatusMappingWorkspace> => {
  await requireEditor();
  return loadLatestStatusMappingWorkspace(
    TEMPORARY_ROOT,
    resortId,
    kind,
    geojsonNames,
    loadCanonicalLatestStatus,
    readMappingStatusHistory,
  );
};

export const saveLatestStatusMapping = async (
  request: SaveLatestStatusMappingRequest,
): Promise<SaveLatestStatusMappingResult> => {
  return runEdit("mapping", request.resortId, request, async () => {
    return saveLatestStatusMappingFile(
      TEMPORARY_ROOT,
      request,
      loadCanonicalLatestStatus,
      readMappingStatusHistory,
    );
  });
};
