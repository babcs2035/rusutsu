import "server-only";

import type { InternalDataApiScope } from "@/lib/internalDataApiScopes";
import { authorizeInternalDataApiRequest } from "@/server/internalDataApiAuth";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
} as const;

export const internalApiJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE_HEADERS });

export const internalApiError = (
  status: number,
  code: string,
  message: string,
) => internalApiJson({ error: { code, message } }, status);

export const requireInternalApiRequest = (
  request: Request,
  requiredScope: InternalDataApiScope,
): Response | null => {
  const authorization = authorizeInternalDataApiRequest(request, requiredScope);
  if (authorization.authorized) return null;
  if (authorization.reason === "FORBIDDEN") {
    return internalApiError(
      403,
      "FORBIDDEN",
      "Token does not grant this scope",
    );
  }
  if (authorization.reason !== "UNAUTHORIZED") {
    return internalApiError(
      503,
      "INTERNAL_API_UNAVAILABLE",
      "Internal data API is not configured",
    );
  }
  return Response.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "A valid Bearer token is required",
      },
    },
    {
      status: 401,
      headers: {
        ...NO_STORE_HEADERS,
        "WWW-Authenticate": "Bearer",
      },
    },
  );
};

export const logInternalApiFailure = (message: string, error: unknown) => {
  const metadata =
    error instanceof Error
      ? {
          name: error.name,
          ...(error.cause instanceof Error
            ? { causeName: error.cause.name }
            : {}),
        }
      : { name: "UnknownError" };
  console.error(message, metadata);
};
