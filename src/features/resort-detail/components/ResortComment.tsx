"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import {
  type CommentPart,
  parseCommentContent,
  removeGeneratedCommentLinks,
} from "../utils/commentContent";
import { conditionText, sourceUrls } from "../utils/currentConditions";

export function ResortComment({
  html,
  resortId,
  urls,
}: {
  html: string;
  resortId: string;
  urls: string[];
}) {
  const cleaned = removeGeneratedCommentLinks(html, resortId);
  const links = sourceUrls(urls);
  const baseUrl = links[0];
  const [parsed, setParsed] = useState<{
    html: string;
    baseUrl?: string;
    parts: CommentPart[];
  } | null>(null);
  useEffect(() => {
    setParsed({
      html: cleaned,
      baseUrl,
      parts: parseCommentContent(cleaned, document, baseUrl),
    });
  }, [cleaned, baseUrl]);
  const fallback = conditionText(
    cleaned.replace(/<(script|style|iframe|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ""),
  );
  if (!fallback && !links.length) return null;
  const parts =
    parsed?.html === cleaned && parsed.baseUrl === baseUrl
      ? parsed.parts
      : [{ text: fallback ?? "" }];
  let offset = 0;
  return (
    <div className="space-y-1">
      {fallback && (
        <div className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
          {parts.map(part => {
            const key = offset;
            offset += part.text.length;
            return part.href ? (
              <a
                key={key}
                href={part.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline text-blue-700 underline underline-offset-2"
              >
                {part.text}
              </a>
            ) : (
              <span key={key}>{part.text}</span>
            );
          })}
        </div>
      )}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {links.map((url, index) => (
            <ExternalLinkComponent
              key={url}
              href={url}
              title={url}
              className="min-h-8 font-medium text-blue-700 underline underline-offset-2"
              icon={<ExternalLink aria-hidden="true" className="size-3.5" />}
            >
              公式情報{links.length > 1 ? ` ${index + 1}` : ""}を見る
            </ExternalLinkComponent>
          ))}
        </div>
      )}
    </div>
  );
}
