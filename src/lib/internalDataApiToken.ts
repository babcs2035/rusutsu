import { createHash, timingSafeEqual } from "node:crypto";

export type ApiBearerAuthorization =
  | { authorized: true }
  | { authorized: false; reason: "UNAUTHORIZED" | "UNCONFIGURED" };

const bearerToken = (authorization: string | null): string | null => {
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/iu.exec(authorization);
  return match?.[1] ?? null;
};

const tokenDigest = (token: string): Buffer =>
  createHash("sha256").update(token, "utf8").digest();

export const hasValidInternalDataApiToken = (
  authorization: string | null,
  expectedToken: string,
): boolean => {
  const suppliedToken = bearerToken(authorization);
  if (!suppliedToken || expectedToken.length === 0) return false;
  return timingSafeEqual(
    tokenDigest(suppliedToken),
    tokenDigest(expectedToken),
  );
};

/** 一つのサーバー専用資格情報を検証し，設定漏れと不正な要求を区別する． */
export function authorizeApiBearerToken(
  authorization: string | null,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ApiBearerAuthorization {
  const expected = environment.API_BEARER_TOKEN?.trim();
  if (!expected) return { authorized: false, reason: "UNCONFIGURED" };
  return hasValidInternalDataApiToken(authorization, expected)
    ? { authorized: true }
    : { authorized: false, reason: "UNAUTHORIZED" };
}
