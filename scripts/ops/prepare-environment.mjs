import { chmodSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  loginKeys,
  publicUrl,
  tokenKeys,
  validateSettings,
} from "./production-settings.mjs";

function environment(container) {
  return Object.fromEntries(
    (container.Config?.Env ?? []).map(entry => {
      const index = entry.indexOf("=");
      return [entry.slice(0, index), entry.slice(index + 1)];
    }),
  );
}

export function prepareEnvironment(containers, settings) {
  const [db, app] = containers;
  if (!db || !app)
    throw new Error("Both existing DB and app containers are required.");
  const project = db.Config?.Labels?.["com.docker.compose.project"];
  if (
    !/^[a-z0-9][a-z0-9_-]*$/.test(project ?? "") ||
    app.Config?.Labels?.["com.docker.compose.project"] !== project ||
    db.Config?.Labels?.["com.docker.compose.service"] !== "db" ||
    app.Config?.Labels?.["com.docker.compose.service"] !== "app"
  ) {
    throw new Error(
      "Existing DB/app Compose identities do not match; no new DB will be created.",
    );
  }
  const mounts = (db.Mounts ?? []).filter(
    mount => mount.Destination === "/var/lib/postgresql/data",
  );
  if (mounts.length !== 1 || mounts[0].Type !== "volume" || !mounts[0].Name) {
    throw new Error("Cannot identify the existing PostgreSQL named volume.");
  }
  const dbEnv = environment(db);
  const appEnv = environment(app);
  if (dbEnv.PGDATA && dbEnv.PGDATA !== "/var/lib/postgresql/data")
    throw new Error("Custom PGDATA needs a separate migration review.");
  if (!/^postgres:16(?:[.-]|$)/.test(db.Config.Image ?? "")) {
    throw new Error(
      "This deployment requires the existing PostgreSQL 16 container.",
    );
  }
  for (const key of ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"]) {
    if (!dbEnv[key])
      throw new Error(
        `Cannot recover existing ${key}; no new credentials will be generated.`,
      );
  }
  let databaseUrl;
  try {
    databaseUrl = new URL(appEnv.DATABASE_URL);
    if (
      !["postgresql:", "postgres:"].includes(databaseUrl.protocol) ||
      !["db", "rusutsu-db"].includes(databaseUrl.hostname) ||
      (databaseUrl.port && databaseUrl.port !== "5432") ||
      decodeURIComponent(databaseUrl.username) !== dbEnv.POSTGRES_USER ||
      decodeURIComponent(databaseUrl.password) !== dbEnv.POSTGRES_PASSWORD ||
      decodeURIComponent(databaseUrl.pathname.slice(1)) !== dbEnv.POSTGRES_DB
    )
      throw new Error();
  } catch {
    throw new Error(
      "Existing app/DB credentials do not match; review the connection without resetting the DB.",
    );
  }
  const updates = validateSettings(settings);
  let baseUrl = updates.DATA_API_BASE_URL;
  if (!baseUrl) {
    let auth;
    try {
      auth = new URL(appEnv.AUTH_URL);
      if (
        !["", "/", "/rusutsu", "/rusutsu/"].includes(auth.pathname) ||
        auth.search ||
        auth.hash ||
        auth.username ||
        auth.password
      )
        throw new Error();
      baseUrl = publicUrl(`${auth.origin}/rusutsu`);
    } catch {
      throw new Error(
        "Set GitHub Variable DATA_API_BASE_URL to the production HTTPS URL including /rusutsu.",
      );
    }
  }
  baseUrl = publicUrl(baseUrl);
  /** @type {Record<string, string>} */
  const result = {
    COMPOSE_PROJECT_NAME: project,
    POSTGRES_VOLUME: mounts[0].Name,
    POSTGRES_USER: dbEnv.POSTGRES_USER,
    POSTGRES_PASSWORD: dbEnv.POSTGRES_PASSWORD,
    POSTGRES_DB: dbEnv.POSTGRES_DB,
    PRODUCTION_DATABASE_URL: appEnv.DATABASE_URL,
    APP_PORT: publishedPort(app, "3000/tcp"),
    DB_PORT: publishedPort(db, "5432/tcp"),
    AUTH_URL: new URL(baseUrl).origin,
    AUTH_TRUST_HOST: appEnv.AUTH_TRUST_HOST || "true",
    DATA_API_BASE_URL: baseUrl,
  };
  for (const key of loginKeys) {
    if (!updates[key] && !appEnv[key])
      throw new Error(
        `Set GitHub Secret ${key}; the existing app does not have this login setting.`,
      );
    result[key] = updates[key] || appEnv[key];
  }
  for (const key of tokenKeys) result[key] = updates[key];
  for (const [key, fallback] of Object.entries({
    CRAWLER_ARTIFACT_RETENTION_DAYS: "30",
    CRAWL_LATEST_CRON: "0 7 * * *",
    CRAWL_LATEST_CONCURRENCY: "1",
    CRAWL_LATEST_TIMEOUT_MS: "1200000",
  }))
    result[key] = appEnv[key] || fallback;
  return result;
}

function publishedPort(container, port) {
  const bindings = container.HostConfig?.PortBindings?.[port];
  if (!bindings?.length || !/^\d+$/.test(bindings[0].HostPort)) {
    throw new Error(
      "Cannot recover the existing published application/database port.",
    );
  }
  return bindings[0].HostPort;
}

export function shellEnvironment(values) {
  return Object.entries(values)
    .map(([key, value]) => {
      if (
        !/^[A-Z][A-Z0-9_]*$/.test(key) ||
        typeof value !== "string" ||
        /[\0\r\n]/.test(value)
      ) {
        throw new Error(
          "Invalid production environment value; values are hidden.",
        );
      }
      return `export ${key}='${value.replaceAll("'", "'\\''")}'\n`;
    })
    .join("");
}

async function main() {
  try {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    let settings;
    let containers;
    try {
      settings = JSON.parse(
        Buffer.from(
          process.env.RUSUTSU_SETTINGS_B64 || "",
          "base64",
        ).toString(),
      );
      containers = JSON.parse(input);
    } catch {
      throw new Error(
        "Cannot read private deployment settings or container metadata.",
      );
    }
    const values = prepareEnvironment(containers, settings);
    const target = path.join(
      process.argv[2] || "/operations",
      "pending.env.sh",
    );
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, shellEnvironment(values), { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
    console.log(
      "Existing database, volume, ports and login settings preserved; API settings prepared.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();
