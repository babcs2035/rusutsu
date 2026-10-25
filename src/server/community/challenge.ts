import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  AnonymousChallenge,
  AnonymousProof,
} from "@/features/corrections/anonymousCheck";

const sign = (body: string) =>
  createHmac("sha256", process.env.AUTH_SECRET || "local-contributions")
    .update(body)
    .digest("base64url");
export function issueAnonymousChallenge(
  scope: string,
  identity: string,
  now = Date.now(),
): AnonymousChallenge {
  const body = Buffer.from(
    JSON.stringify({
      scope,
      identity,
      salt: randomUUID(),
      expiresAt: now + 300_000,
    }),
  ).toString("base64url");
  return { token: `${body}.${sign(body)}`, difficulty: 16 };
}
export function verifyAnonymousProof(
  proof: AnonymousProof | undefined,
  scope: string,
  identity: string,
  now = Date.now(),
) {
  if (
    !proof ||
    typeof proof.token !== "string" ||
    proof.token.length > 2000 ||
    !/^\d{1,10}$/.test(proof.nonce)
  )
    return false;
  const [body, signature, ...extra] = proof.token.split(".");
  if (!body || !signature || extra.length) return false;
  const expected = Buffer.from(sign(body)),
    actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      payload.scope !== scope ||
      payload.identity !== identity ||
      payload.expiresAt < now ||
      payload.expiresAt > now + 300_000
    )
      return false;
    return createHash("sha256")
      .update(`${proof.token}:${proof.nonce}`)
      .digest("hex")
      .startsWith("0000");
  } catch {
    return false;
  }
}
export class AnonymousChallengeError extends Error {
  constructor(readonly challenge: AnonymousChallenge) {
    super("送信の確認が必要です。もう一度お試しください。");
  }
}
