import { chownSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (
  !["/app/var/crawler-artifacts", "/app/var/crawler-worker-artifacts"].includes(
    root,
  )
)
  throw new Error("Only crawler artifact volumes may be initialized.");
mkdirSync(root, { recursive: true });
function visit(file) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) return;
  chownSync(file, 1001, 1001);
  if (stat.isDirectory())
    for (const name of readdirSync(file)) visit(path.join(file, name));
}
visit(root);
console.log("Crawler artifact volume permissions prepared.");
