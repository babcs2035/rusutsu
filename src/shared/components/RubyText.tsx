import { Fragment } from "react";
import type { ResortRubySegment } from "@/shared/types/resortReading";

type Props = {
  /** ルビセグメント。null の場合は fallback をそのまま表示する */
  segments: ResortRubySegment[] | null;
  /** ルビ情報が無い場合に表示するテキスト */
  fallback: string;
};

/** かな・漢字を含む区切りだけ、上にふりがなを出す */
const JAPANESE_TEXT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export const shouldShowRuby = (segment: ResortRubySegment) =>
  Boolean(segment.ruby) && JAPANESE_TEXT.test(segment.text);

/**
 * ふりがな付きテキストを <ruby> 要素で描画する。
 * ルビ情報が無い場合は fallback を素のテキストとして表示する。
 * 英字・数字だけの区切りの読みは並び替え・検索用で、表示はしない。
 */
export const RubyText = ({ segments, fallback }: Props) => {
  if (!segments || segments.length === 0) return <>{fallback}</>;

  let offset = 0;
  const keyedSegments = segments.map(segment => {
    const key = `${offset}-${segment.text}`;
    offset += segment.text.length;
    return { key, segment };
  });

  return (
    <>
      {keyedSegments.map(({ key, segment }) =>
        shouldShowRuby(segment) ? (
          <ruby key={key} className="ruby-text">
            {segment.text}
            <rt>{segment.ruby}</rt>
          </ruby>
        ) : (
          <Fragment key={key}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
};
