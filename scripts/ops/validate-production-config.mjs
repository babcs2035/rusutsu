import { publicUrl, validateSettings } from "./production-settings.mjs";

try {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const config = JSON.parse(input);
  const app = config.services.app.environment;
  validateSettings(app);
  const url = publicUrl(app.PUBLIC_READINESS_URL);
  if (app.DATA_API_BASE_URL || app.AUTH_URL !== new URL(url).origin) {
    throw new Error(
      "Canonical app must use the local DB and AUTH_URL must be the public HTTPS origin.",
    );
  }
  if (
    !config.volumes.postgres_data.external ||
    !config.volumes.postgres_data.name
  ) {
    throw new Error(
      "Production must reuse an explicitly identified external PostgreSQL volume.",
    );
  }
} catch {
  console.error(
    "Invalid production Compose configuration; credential values are hidden.",
  );
  process.exitCode = 1;
}
