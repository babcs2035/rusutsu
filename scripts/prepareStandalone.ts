// 共有・配布用の standalone に静的ファイルだけを補い，ローカルの生成物を除く．
import { cp, readdir, rm } from "node:fs/promises";
import path from "node:path";

const build = process.env.RUSUTSU_DIST_DIR || ".next";
const standalone = path.join(build, "standalone");
const entries = await readdir(standalone);

// Next.js は trace とは別の経路でも dotenv ファイルをコピーする．
for (const entry of entries.filter(name => /^\.env(?:\.|$)/u.test(name))) {
  await rm(path.join(standalone, entry), { force: true });
}

for (const data of ["data", "src/private/data"]) {
  for (const runtime of ["tmp", "logs", "crawl_latest_dom"]) {
    await rm(path.join(standalone, data, "resorts-temporary", runtime), {
      recursive: true,
      force: true,
    });
  }
  await rm(path.join(standalone, data, "backups"), {
    recursive: true,
    force: true,
  });
}
await rm(path.join(standalone, "backups"), { recursive: true, force: true });
await cp("public", path.join(standalone, "public"), { recursive: true });
await cp(path.join(build, "static"), path.join(standalone, build, "static"), {
  recursive: true,
});
