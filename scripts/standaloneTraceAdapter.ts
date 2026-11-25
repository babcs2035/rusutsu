// Next.js が standalone をコピーする前に，起動時の依存一覧からローカル作業データを除く．
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextAdapter } from "next";
import { z } from "zod";

const localOnlyPath =
  /(?:^|\/)(?:\.env[^/]*|backups|resorts-temporary\/(?:tmp|logs|crawl_latest_dom))(?:\/|$)/u;
const traceSchema = z.looseObject({
  files: z.array(z.string()),
  fileHashes: z.array(z.string()).optional(),
  symlinks: z
    .array(z.tuple([z.number(), z.string(), z.number().optional()]))
    .optional(),
});

const adapter: NextAdapter = {
  name: "rusutsu-standalone-trace",
  /** route glob が適用されない instrumentation の一覧だけを補正する． */
  async onBuildComplete({ distDir, projectDir }): Promise<void> {
    const traceFile = path.join(
      distDir,
      "server",
      "instrumentation.js.nft.json",
    );
    const trace = traceSchema.parse(
      JSON.parse(await readFile(traceFile, "utf8")),
    );
    const base = path.dirname(traceFile);
    const indexes = new Map<number, number>();
    const files = trace.files.filter((file, index) => {
      const relative = path.relative(projectDir, path.resolve(base, file));
      if (localOnlyPath.test(relative.split(path.sep).join("/"))) return false;
      indexes.set(index, indexes.size);
      return true;
    });
    if (files.length === trace.files.length) return;
    // Turbopack はハッシュと symlink を files の添字で参照する．
    await writeFile(
      traceFile,
      JSON.stringify({
        ...trace,
        files,
        fileHashes: trace.fileHashes?.filter((_, index) => indexes.has(index)),
        symlinks: trace.symlinks?.flatMap(([index, ...target]) => {
          const mapped = indexes.get(index);
          return mapped === undefined ? [] : [[mapped, ...target]];
        }),
      }),
    );
  },
};

export default adapter;
