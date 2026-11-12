"use client";

import { useEffect, useState } from "react";
import {
  type CommentPart,
  collapseBlankLines,
  parseCommentContent,
  removeGeneratedCommentLinks,
} from "../utils/commentContent";
import { conditionText, sourceUrls } from "../utils/currentConditions";

/** コメント本文。出典は「コメント」見出しの横に出す */
export function ResortComment({
  html,
  resortId,
  urls,
}: {
  html: string;
  resortId: string;
  /** 本文中の相対リンクを解決するために使う */
  urls: string[];
}) {
  const cleaned = removeGeneratedCommentLinks(html, resortId);
  const baseUrl = sourceUrls(urls)[0];
  const [parsed, setParsed] = useState<{
    html: string;
    baseUrl?: string;
    parts: CommentPart[];
  } | null>(null);
  useEffect(() => {
    setParsed({
      html: cleaned,
      baseUrl,
      parts: collapseBlankLines(
        parseCommentContent(cleaned, document, baseUrl),
      ),
    });
  }, [cleaned, baseUrl]);
  const fallback = conditionText(
    cleaned.replace(/<(script|style|iframe|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ""),
  );
  if (!fallback) return null;
  const parts =
    parsed?.html === cleaned && parsed.baseUrl === baseUrl
      ? parsed.parts
      : collapseBlankLines([{ text: fallback }]);
  let offset = 0;
  return (
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
  );
}
