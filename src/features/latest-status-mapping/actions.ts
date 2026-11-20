"use server";

import path from "node:path";
import {
  readMappingCrawlLatestStatus,
  readMappingStatusHistory,
} from "@/lib/crawlLatestCurrent";
import { runEdit } from "@/server/edit-requests/workflow";
import { saveLatestStatusMappingFile } from "./server/mappingFiles";
import type {
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
