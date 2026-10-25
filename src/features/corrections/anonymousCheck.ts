export type AnonymousProof = { token: string; nonce: string };
export type AnonymousChallenge = { token: string; difficulty: number };

/** A computational bot check runs only when the server detects a burst. */
export async function withAnonymousCheck<T>(
  send: (proof?: AnonymousProof) => Promise<T>,
): Promise<T> {
  const response = await send();
  if (!response || typeof response !== "object" || !("challenge" in response))
    return response;
  const challenge = response.challenge as AnonymousChallenge;
  if (
    typeof challenge?.token !== "string" ||
    challenge.token.length > 2000 ||
    challenge.difficulty !== 16
  )
    return response;
  const encoder = new TextEncoder();
  for (let nonce = 0; nonce < 2_000_000; nonce++) {
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(`${challenge.token}:${nonce}`),
      ),
    );
    if (digest[0] === 0 && digest[1] === 0)
      return send({ token: challenge.token, nonce: String(nonce) });
    if (nonce % 1000 === 0)
      await new Promise(resolve => setTimeout(resolve, 0));
  }
  return response;
}
