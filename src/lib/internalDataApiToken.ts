import { createHash, timingSafeEqual } from "node:crypto";

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
