import { z } from "zod";

export type XProfile = { name: string; avatarUrl: string | null };
export const isXHandle = (handle: string) =>
  /^[a-zA-Z0-9_]{1,15}$/.test(handle);

const responseSchema = z.object({
  code: z.literal(200),
  user: z.object({
    screen_name: z.string(),
    name: z.string().trim().min(1).max(200),
    avatar_url: z.string().nullable().optional(),
  }),
});

export function parseXProfile(value: unknown, handle: string): XProfile | null {
  const parsed = responseSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.user.screen_name.toLowerCase() !== handle.toLowerCase()
  )
    return null;
  const user = parsed.data.user;
  let avatarUrl: string | null = null;
  try {
    const url = new URL(user.avatar_url ?? "");
    if (
      url.protocol === "https:" &&
      url.hostname === "pbs.twimg.com" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith("/profile_images/")
    ) {
      avatarUrl = url.href;
    }
  } catch {
    // Keep the display name even if the image is missing or invalid.
  }
  return { name: user.name, avatarUrl };
}

export async function fetchXProfile(handle: string): Promise<XProfile | null> {
  if (!isXHandle(handle)) return null;
  try {
    // FxEmbed public profile API: https://docs.fxembed.com/api/twitter/operations/2profilehandle/
    const response = await fetch(
      `https://api.fxtwitter.com/2/profile/${handle.toLowerCase()}`,
      {
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(5000),
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) return null;
    return parseXProfile(await response.json(), handle);
  } catch {
    return null;
  }
}
