"use server";

import path from "node:path";
import { readCurrentCrawlLatestStatus } from "@/lib/crawlLatestCurrent";
import { requireAdmin } from "@/lib/requireAdmin";
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

const loadCanonicalLatestStatus = readCurrentCrawlLatestStatus;

export const loadLatestStatusMapping = async (
  resortId: string,
  kind: LatestStatusMappingKind,
  geojsonNames?: string[],
): Promise<LatestStatusMappingWorkspace> => {
  await requireAdmin();
  return loadLatestStatusMappingWorkspace(
    TEMPORARY_ROOT,
    resortId,
    kind,
    geojsonNames,
    loadCanonicalLatestStatus,
  );
};

export const saveLatestStatusMapping = async (
  request: SaveLatestStatusMappingRequest,
): Promise<SaveLatestStatusMappingResult> => {
  await requireAdmin();
  return saveLatestStatusMappingFile(
    TEMPORARY_ROOT,
    request,
    loadCanonicalLatestStatus,
  );
};
