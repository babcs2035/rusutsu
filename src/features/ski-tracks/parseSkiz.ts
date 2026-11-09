import { inflateRawSync } from "node:zlib";
import {
  MAX_SKIZ_UNCOMPRESSED_BYTES,
  parseSkizArchive,
  SkizFormatError,
  verifySkizEntry,
} from "./parseSkizArchive";
import type { SkizParseResult } from "./parseSkizContents";
import { parseSkizContents } from "./parseSkizContents";

export { MAX_SKIZ_BYTES, SkizFormatError } from "./parseSkizArchive";
export type { SkizParseResult } from "./parseSkizContents";

export function parseSkiz(input: Buffer): SkizParseResult {
  if (!Buffer.isBuffer(input)) throw new SkizFormatError();
  const archive = parseSkizArchive(input);
  const files = new Map<string, Uint8Array>();
  for (const [name, entry] of archive) {
    let data: Buffer;
    try {
      data =
        entry.method === 0
          ? Buffer.from(entry.compressedData)
          : inflateRawSync(Buffer.from(entry.compressedData), {
              maxOutputLength: MAX_SKIZ_UNCOMPRESSED_BYTES,
            });
    } catch {
      throw new SkizFormatError("ZIP entry could not be decompressed.");
    }
    files.set(name, verifySkizEntry(entry, data));
  }
  return parseSkizContents(files);
}
