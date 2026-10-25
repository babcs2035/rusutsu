import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { AnonymousProof } from "@/features/corrections/anonymousCheck";
import { prisma } from "@/lib/prisma";
import {
  AnonymousChallengeError,
  issueAnonymousChallenge,
  verifyAnonymousProof,
} from "./challenge";

export { AnonymousChallengeError } from "./challenge";

const WINDOW_MS = 15 * 60_000;
export async function consumeWriteLimit(
  scope: string,
  identity: string,
  limit = 30,
  windowMs = WINDOW_MS,
) {
  const now = Date.now();
  const key = createHmac(
    "sha256",
    process.env.AUTH_SECRET || "local-contributions",
  )
    .update(`${scope}:${identity}:${Math.floor(now / windowMs)}`)
    .digest("hex");
  const row = await prisma.contributionRateBucket.upsert({
    where: { key },
    create: {
      key,
      count: 1,
      expiresAt: new Date((Math.floor(now / windowMs) + 1) * windowMs),
    },
    update: { count: { increment: 1 } },
  });
  if (row.count > limit)
    throw new Error(
      "短時間に多くの送信がありました。少し待ってからお試しください。",
    );
  return row.count;
}

export async function anonymousSubmissionKey(operationKey: string) {
  const jar = await cookies();
  let identity = jar.get("rusutsu-contribution-id")?.value;
  if (!identity || !/^[a-f0-9-]{36}$/.test(identity)) {
    identity = randomUUID();
    jar.set("rusutsu-contribution-id", identity, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.AUTH_URL?.startsWith("https://") ?? false,
      path: "/rusutsu",
      maxAge: 86400,
    });
  }
  return createHmac("sha256", process.env.AUTH_SECRET || "local-contributions")
    .update(`${identity}:${operationKey}`)
    .digest("hex");
}

export async function limitAnonymous(
  scope: string,
  limit = 10,
  proof?: AnonymousProof,
) {
  const identity = await anonymousSubmissionKey("rate-limit");
  const count = await consumeWriteLimit(scope, identity, limit * 2);
  // Only trust an address when the deployment overwrites this header at its
  // trusted proxy. Never trust arbitrary X-Forwarded-For from the Internet.
  const requestHeaders = await headers();
  const address =
    process.env.CONTRIBUTION_TRUST_PROXY === "true"
      ? requestHeaders.get("x-real-ip")
      : null;
  const networkCount = await consumeWriteLimit(
    `${scope}:network`,
    address ?? "shared-untrusted",
    address ? limit * 3 : 300,
  );
  if (count > 5 || networkCount > (address ? 15 : 150)) {
    if (!verifyAnonymousProof(proof, scope, identity))
      throw new AnonymousChallengeError(
        issueAnonymousChallenge(scope, identity),
      );
    await consumeWriteLimit("challenge", proof?.token ?? "", 1, 300_000);
  }
}
