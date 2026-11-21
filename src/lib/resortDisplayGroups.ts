import "server-only";

import { z } from "zod";
import {
  fetchInternalDataApi,
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

const RESOURCE_PATH = "/api/admin/resort-groups";
const groupsSchema = z.object({ groups: z.array(displayGroupSchema) });

const readRemoteGroups = async (query: string) => {
  const response = await fetchInternalDataApi(`${RESOURCE_PATH}${query}`);
  return groupsSchema.parse(await response.json()).groups;
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
