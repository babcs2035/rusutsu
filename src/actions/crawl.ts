import "server-only";

/**
 * Backward-compatible server-internal exports.
 *
 * This module intentionally is not a `"use server"` entry point: exposing an
 * arbitrary crawler name as an unauthenticated browser-callable Server Action
 * would allow visitors to start crawlers. The crawler implementations and the
 * manual runner remain available through the internal module below.
 */
export {
  runAllCrawlersIfNeeded,
  runCrawlerIfNeeded,
} from "@/lib/crawl";
