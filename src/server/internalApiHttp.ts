import "server-only";

import { httpProblem } from "@/server/httpProblem";
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
  details?: unknown,
): Response => httpProblem(status, code, message, NO_STORE_HEADERS, details);

export const requireInternalApiRequest = (
  request: Request,
): Response | null => {
  const authorization = authorizeInternalDataApiRequest(request);
  if (authorization.authorized) return null;
  if (authorization.reason !== "UNAUTHORIZED") {
    return internalApiError(
      503,
      "INTERNAL_API_UNAVAILABLE",
      "Internal data API is not configured",
    );
  }
  return httpProblem(401, "UNAUTHORIZED", "A valid Bearer token is required", {
    ...NO_STORE_HEADERS,
    "WWW-Authenticate": "Bearer",
  });
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
