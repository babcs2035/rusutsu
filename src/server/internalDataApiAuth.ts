import "server-only";

import {
  authorizeInternalDataApiScope,
  type InternalDataApiScope,
} from "@/lib/internalDataApiScopes";

export type InternalDataApiAuthorization =
  | { authorized: true }
  | {
      authorized: false;
      reason: "UNAUTHORIZED" | "FORBIDDEN" | "UNCONFIGURED" | "MISCONFIGURED";
    };

export const authorizeInternalDataApiRequest = (
  request: Request,
  requiredScope: InternalDataApiScope,
): InternalDataApiAuthorization => {
  return authorizeInternalDataApiScope(
    request.headers.get("authorization"),
    requiredScope,
  );
};
