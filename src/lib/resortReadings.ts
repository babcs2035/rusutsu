import {
  formerNamesSchema,
  nameRubySchema,
} from "@/server/ski-resorts/readingContract";
import type { ResortReadingInfo } from "@/shared/types/resortReading";

/** DB/APIから取得した値だけを使用し、旧JSONには戻らない。 */
export function getResortReadingInfo(resort: {
  nameRuby: unknown;
  formerNames: unknown;
}): ResortReadingInfo {
  const ruby = nameRubySchema.parse(resort.nameRuby);
  return {
    nameRuby: ruby.length ? ruby : null,
    reading: ruby.length
      ? ruby.map(segment => segment.ruby ?? segment.text).join("")
      : null,
    formerNames: formerNamesSchema.parse(resort.formerNames),
  };
}
