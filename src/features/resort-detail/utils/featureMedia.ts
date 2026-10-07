export type FeatureMedia = { images: string[]; videos: string[] };

export function httpUrl(value?: string | null) {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Embed only a known YouTube video, including shared links and Shorts. */
export function youtubeEmbedUrl(value?: string | null) {
  const valid = httpUrl(value);
  if (!valid) return null;
  const url = new URL(valid);
  const host = url.hostname.replace(/^(www\.|m\.)/u, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (/^\/(embed|shorts|live)\//u.test(url.pathname))
      id = url.pathname.split("/")[2];
  }
  if (!id || !/^[a-zA-Z0-9_-]{11}$/u.test(id)) return null;
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  const start = url.searchParams.get("start") ?? url.searchParams.get("t");
  const time = start && /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/u.exec(start);
  if (time) {
    const seconds =
      Number(time[1] ?? 0) * 3600 +
      Number(time[2] ?? 0) * 60 +
      Number(time[3] ?? 0);
    if (seconds > 0 && Number.isSafeInteger(seconds))
      embed.searchParams.set("start", String(seconds));
  }
  return embed.href;
}

export function collectFeatureMedia(
  properties: Array<{
    image?: string | null;
    youtubeUrl?: string | null;
    link?: string | null;
  }>,
): FeatureMedia {
  const images = new Set<string>();
  const videos = new Set<string>();
  for (const item of properties) {
    const image = httpUrl(item.image);
    if (image) images.add(image);
    for (const value of [item.youtubeUrl, item.link]) {
      const video = youtubeEmbedUrl(value);
      if (video) videos.add(video);
    }
  }
  return { images: [...images], videos: [...videos] };
}
