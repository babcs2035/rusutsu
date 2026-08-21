#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

function parseArgs(argv) {
  const urls = [];
  let outDir = null;
  let waitFor = null;
  let waitMs = 1500;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];

    if (arg === "--url" && value) {
      urls.push(value);
      i++;
    } else if (arg === "--out" && value) {
      outDir = value;
      i++;
    } else if (arg === "--wait-for" && value) {
      waitFor = value;
      i++;
    } else if (arg === "--wait-ms" && value) {
      waitMs = Number(value);
      i++;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (urls.length === 0) {
    throw new Error("At least one --url is required");
  }
  if (!outDir) {
    throw new Error("--out is required");
  }
  if (!Number.isFinite(waitMs) || waitMs < 0) {
    throw new Error("--wait-ms must be a non-negative number");
  }

  return { urls, outDir, waitFor, waitMs };
}

const { urls, outDir, waitFor, waitMs } = parseArgs(process.argv.slice(2));
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ locale: "ja-JP" });
const consoleErrors = [];
let failed = false;

try {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const page = await context.newPage();

    page.on("console", message => {
      if (message.type() === "error") {
        consoleErrors.push({
          page: i + 1,
          url,
          message: message.text(),
        });
      }
    });

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      if (waitFor) {
        await page.waitForSelector(waitFor, {
          state: "attached",
          timeout: 30000,
        });
      }
      await page.waitForTimeout(waitMs);
    } catch (error) {
      failed = true;
      console.error(
        `Failed to render ${url}: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      const filename = `page-${String(i + 1).padStart(2, "0")}.html`;
      await fs.writeFile(path.join(outDir, filename), await page.content());
      await page.close();
    }
  }
} finally {
  await fs.writeFile(
    path.join(outDir, "console-errors.json"),
    JSON.stringify(consoleErrors, null, 2),
  );
  await browser.close();
}

if (failed) {
  process.exitCode = 1;
}
