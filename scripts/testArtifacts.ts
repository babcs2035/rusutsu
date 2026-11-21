// mise の試験実行ごとに，消去可能なディレクトリへ生成物を集約する．
import path from "node:path";

/** 既存の単独実行時にも，private の試験用ディレクトリを使う． */
export function testArtifactPath(name: string): string {
  return path.resolve(
    process.env.RUSUTSU_TEST_ARTIFACT_DIR ??
      "src/private/data/resorts-temporary/tmp",
    name,
  );
}
