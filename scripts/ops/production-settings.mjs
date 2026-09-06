import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const tokenKeys = ["ADMIN", "CRAWLER", "DIAGNOSTICS"].map(
  scope => `INTERNAL_DATA_API_${scope}_TOKEN`,
);
export const loginKeys = [
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ADMIN_EMAILS",
];

export function validateSettings(settings) {
  for (const key of tokenKeys) {
    if (!/^[a-fA-F0-9]{64}$/.test(settings[key] ?? "")) {
      throw new Error(
        `GitHub Secret ${key} must contain 64 hexadecimal characters.`,
      );
    }
  }
  if (new Set(tokenKeys.map(key => settings[key])).size !== tokenKeys.length) {
    throw new Error("Use a different value for each API token Secret.");
  }
  if (settings.DATA_API_BASE_URL) publicUrl(settings.DATA_API_BASE_URL);
  return Object.fromEntries(
    [...tokenKeys, ...loginKeys, "DATA_API_BASE_URL"].map(key => [
      key,
      settings[key] || "",
    ]),
  );
}

export function publicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The public URL must be HTTPS and end with /rusutsu.");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    !["/rusutsu", "/rusutsu/"].includes(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error("The public URL must be HTTPS and end with /rusutsu.");
  }
  return `${url.origin}/rusutsu`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    // Secrets enter through env, never through interpolation into shell code.
    const settings = validateSettings(process.env);
    const encoded = Buffer.from(JSON.stringify(settings)).toString("base64");
    if (!process.env.GITHUB_ENV) throw new Error("GITHUB_ENV is required.");
    console.log(`::add-mask::${encoded}`);
    appendFileSync(process.env.GITHUB_ENV, `RUSUTSU_SETTINGS_B64=${encoded}\n`);
    console.log("Production settings validated; secret values are hidden.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
