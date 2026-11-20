import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const tokenKeys = ["API_BEARER_TOKEN"];
export const loginKeys = [
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ADMIN_EMAILS",
];
export const communityKeys = [
  "OPENAI_API_KEY",
  "COMMUNITY_MODERATION_URL",
  "COMMUNITY_MODERATION_TOKEN",
  "COMMUNITY_MODERATION_MODEL",
  "CONTRIBUTION_TRUST_PROXY",
];

export type ProductionSettings = Record<string, string | undefined>;

/** Validates deploy secrets and returns only supported production settings. */
export function validateSettings(
  settings: ProductionSettings,
): Record<string, string> {
  if (!/^[a-fA-F0-9]{64}$/.test(settings.API_BEARER_TOKEN ?? "")) {
    throw new Error(
      "GitHub Secret API_BEARER_TOKEN must contain 64 hexadecimal characters.",
    );
  }
  if (settings.API_BASE_URL) publicUrl(settings.API_BASE_URL);
  return Object.fromEntries(
    [...tokenKeys, ...loginKeys, ...communityKeys, "API_BASE_URL"].map(key => [
      key,
      settings[key] || "",
    ]),
  );
}

/** Normalizes a public Rusutsu URL after enforcing its HTTPS base path. */
export function publicUrl(value: string): string {
  let url: URL;
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
    console.error(
      error instanceof Error ? error.message : "Production settings failed.",
    );
    process.exitCode = 1;
  }
}
