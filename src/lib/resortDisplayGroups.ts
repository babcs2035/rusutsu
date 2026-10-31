import "server-only";

import { z } from "zod";
import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import {
  type DisplayGroup,
  type DisplayGroupDeleteRequest,
  type DisplayGroupDeleteResult,
  type DisplayGroupSaveRequest,
  type DisplayGroupSaveResult,
  displayGroupDeleteRequestSchema,
  displayGroupDeleteResultSchema,
  displayGroupSaveRequestSchema,
  displayGroupSaveResultSchema,
  displayGroupSchema,
} from "@/server/ski-resorts/displayGroupContract";
import {
  deleteDisplayGroupDirect,
  listDisplayGroupsDirect,
  listDisplayGroupsForResortDirect,
  saveDisplayGroupDirect,
} from "@/server/ski-resorts/displayGroupRepository";

const RESOURCE_PATH = "/api/internal/v1/ski-resorts/display-groups";
const groupsSchema = z.object({ groups: z.array(displayGroupSchema) });

const readRemoteGroups = async (query: string) => {
  try {
    const response = await fetchInternalDataApi(`${RESOURCE_PATH}${query}`);
    return groupsSchema.parse(await response.json()).groups;
  } catch (error) {
    // 同時表示に未対応の旧データAPIは、この経路を [resortId] として 400 か 404 を返す。
    // その場合は組もない。
    if (
      error instanceof InternalDataApiError &&
      (error.status === 400 || error.status === 404)
    )
      return [];
    throw error;
  }
};

export async function readDisplayGroups(): Promise<DisplayGroup[]> {
  if (!usesRemoteDataApi()) return listDisplayGroupsDirect();
  return readRemoteGroups("");
}

export async function readDisplayGroupsForResort(
  resortId: string,
): Promise<DisplayGroup[]> {
  if (!usesRemoteDataApi()) return listDisplayGroupsForResortDirect(resortId);
  return readRemoteGroups(`?${new URLSearchParams({ resortId })}`);
}

export async function saveDisplayGroup(
  rawRequest: DisplayGroupSaveRequest,
): Promise<DisplayGroupSaveResult> {
  const request = displayGroupSaveRequestSchema.parse(rawRequest);
  if (!usesRemoteDataApi()) return saveDisplayGroupDirect(request);
  const response = await fetchInternalDataApi(RESOURCE_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return displayGroupSaveResultSchema.parse(await response.json());
}

export async function deleteDisplayGroup(
  rawRequest: DisplayGroupDeleteRequest,
): Promise<DisplayGroupDeleteResult> {
  const request = displayGroupDeleteRequestSchema.parse(rawRequest);
  if (!usesRemoteDataApi()) return deleteDisplayGroupDirect(request);
  const response = await fetchInternalDataApi(RESOURCE_PATH, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return displayGroupDeleteResultSchema.parse(await response.json());
}
