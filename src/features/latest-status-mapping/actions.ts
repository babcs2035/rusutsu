"use server";

import path from "node:path";
import { auth } from "@/auth";
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

const requireAdmin = async (): Promise<void> => {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "admin") {
    throw new Error("管理者権限が必要です。");
  }
};

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
  );
};

export const saveLatestStatusMapping = async (
  request: SaveLatestStatusMappingRequest,
): Promise<SaveLatestStatusMappingResult> => {
  await requireAdmin();
  return saveLatestStatusMappingFile(TEMPORARY_ROOT, request);
};
