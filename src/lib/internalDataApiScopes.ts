import { hasValidInternalDataApiToken } from "@/lib/internalDataApiToken";

export const INTERNAL_DATA_API_SCOPES = [
  "admin-data",
  "crawler-ingest",
  "diagnostics-read",
] as const;

export type InternalDataApiScope = (typeof INTERNAL_DATA_API_SCOPES)[number];

export type InternalDataApiTokenEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type InternalDataApiScopeAuthorization =
  | { authorized: true }
  | {
      authorized: false;
      reason: "UNAUTHORIZED" | "FORBIDDEN" | "UNCONFIGURED" | "MISCONFIGURED";
    };

const TOKEN_ENV_BY_SCOPE = {
  "admin-data": "INTERNAL_DATA_API_ADMIN_TOKEN",
  "crawler-ingest": "INTERNAL_DATA_API_CRAWLER_TOKEN",
  "diagnostics-read": "INTERNAL_DATA_API_DIAGNOSTICS_TOKEN",
} as const satisfies Record<InternalDataApiScope, string>;

const configuredValue = (
  env: InternalDataApiTokenEnvironment,
  name: string,
): string | null => env[name]?.trim() || null;

const configuredScopedTokens = (env: InternalDataApiTokenEnvironment) =>
  INTERNAL_DATA_API_SCOPES.flatMap(scope => {
    const token = configuredValue(env, TOKEN_ENV_BY_SCOPE[scope]);
    return token ? [{ scope, token }] : [];
  });

const hasDuplicateScopedToken = (
  configured: ReadonlyArray<{ scope: InternalDataApiScope; token: string }>,
): boolean =>
  new Set(configured.map(entry => entry.token)).size !== configured.length;

/**
 * Authorizes one narrowly-scoped internal API capability.
 *
 * Each capability requires a distinct scoped token. The former shared token
 * is never accepted, including on fresh installations.
 */
export const authorizeInternalDataApiScope = (
  authorization: string | null,
  requiredScope: InternalDataApiScope,
  env: InternalDataApiTokenEnvironment = process.env,
): InternalDataApiScopeAuthorization => {
  const scopedTokens = configuredScopedTokens(env);
  if (hasDuplicateScopedToken(scopedTokens)) {
    return { authorized: false, reason: "MISCONFIGURED" };
  }

  const expectedToken = configuredValue(env, TOKEN_ENV_BY_SCOPE[requiredScope]);
  if (!expectedToken) {
    return { authorized: false, reason: "UNCONFIGURED" };
  }
  if (hasValidInternalDataApiToken(authorization, expectedToken)) {
    return { authorized: true };
  }
  return {
    authorized: false,
    reason: scopedTokens.some(({ token }) =>
      hasValidInternalDataApiToken(authorization, token),
    )
      ? "FORBIDDEN"
      : "UNAUTHORIZED",
  };
};
