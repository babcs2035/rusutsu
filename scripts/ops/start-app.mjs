import { spawn } from "node:child_process";

// This image serves the canonical production database. Client mode belongs to
// a developer's Next.js process, never to this API container itself.
if (process.env.DATA_API_BASE_URL?.trim()) {
  console.error("The canonical app container must not set DATA_API_BASE_URL.");
  process.exit(1);
}
const child = spawn(process.execPath, ["server.js"], { stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", () => process.exit(1));
child.on("exit", code => process.exit(code ?? 1));
