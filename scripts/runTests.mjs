import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(file)));
    else if (entry.isFile() && entry.name.endsWith(".test.ts"))
      files.push(file);
  }
  return files;
}
const files = [...(await collect("src")), ...(await collect("scripts"))].sort();
if (!files.length) throw new Error("No test files found.");
const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
});
child.on("error", () => process.exit(1));
child.on("exit", code => process.exit(code ?? 1));
