"use client";

import { useState } from "react";
import type { FeatureMedia } from "../utils/featureMedia";
import { FeatureSectionTitle } from "./FeatureHeadline";

function FeatureImage({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-md bg-slate-100"
      aria-label={`${name}の写真を開く`}
    >
      {failed ? (
        <p className="p-3 text-xs text-blue-700">写真を元のサイトで開く ↗</p>
      ) : (
        /* Official images have arbitrary hosts; display the source directly. */
        // biome-ignore lint/performance/noImgElement: External resort images are not configured for Next Image.
        <img
          src={url}
          alt={`${name}の写真`}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </a>
  );
}

const youtubeWatchUrl = (embedUrl: string) => {
  const url = new URL(embedUrl);
  const start = url.searchParams.get("start");
  return `https://www.youtube.com/watch?v=${url.pathname.split("/").at(-1)}${start ? `&t=${start}s` : ""}`;
};

/** 写真は2列の縮小表示、動画は横幅いっぱいで並べる */
export function FeatureMediaGallery({
  media,
  name,
}: {
  media: FeatureMedia;
  name: string;
}) {
  if (!media.images.length && !media.videos.length) return null;
  return (
    <section aria-label="写真・動画">
      <FeatureSectionTitle>写真・動画</FeatureSectionTitle>
      <div className="flex flex-col gap-2">
        {media.images.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {media.images.map(url => (
              <FeatureImage key={url} url={url} name={name} />
            ))}
          </div>
        )}
        {media.videos.map((url, index) => (
          <div key={url} className="overflow-hidden rounded-md">
            <iframe
              src={url}
              title={`${name}のYouTube動画 ${index + 1}`}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="aspect-video w-full border-0"
            />
            <a
              href={youtubeWatchUrl(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="block py-1 text-xs font-medium text-blue-700 hover:underline"
            >
              YouTubeで見る ↗
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
