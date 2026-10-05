import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      // Do not run copied repositories, fixtures or browser outputs as source tests.
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        file === path.join("src", "private", "data")
      )
        continue;
      files.push(...(await collect(file)));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts"))
      files.push(file);
  }
  return files;
}
const files = [...(await collect("src")), ...(await collect("scripts"))].sort();
if (!files.length) throw new Error("No test files found.");
// Next compiles JSX automatically; tsx needs the same transform for component tests.
const config = path.resolve(
  "src/private/data/resorts-temporary/tmp/test-runner/tsconfig.json",
);
await mkdir(path.dirname(config), { recursive: true });
await writeFile(
  config,
  JSON.stringify({
    extends: path.resolve("tsconfig.json"),
    compilerOptions: { jsx: "react-jsx" },
  }),
);
const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  env: { ...process.env, TSX_TSCONFIG_PATH: config },
});
child.on("error", () => process.exit(1));
child.on("exit", code => process.exit(code ?? 1));
