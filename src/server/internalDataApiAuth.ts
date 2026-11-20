import "server-only";

import {
  type ApiBearerAuthorization,
  authorizeApiBearerToken,
} from "@/lib/internalDataApiToken";

export const authorizeInternalDataApiRequest = (
  request: Request,
): ApiBearerAuthorization => {
  return authorizeApiBearerToken(request.headers.get("authorization"));
};
