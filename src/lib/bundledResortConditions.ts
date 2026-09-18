import { promises as fs } from "node:fs";
import path from "node:path";
import {
  conditionsFromCapture,
  type ResortConditions,
} from "@/features/resort-detail/utils/currentConditions";
import { listLatestStatusFiles } from "./latestStatusFiles";

export async function readBundledResortConditions(
  resortId: string,
  root = path.join(process.cwd(), "src/private/data/resorts-temporary"),
): Promise<ResortConditions> {
  const empty: ResortConditions = {
    weather: null,
    comment: null,
    news: null,
  };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(resortId)) return empty;
  const directory = path.join(root, "latest_data", resortId);
  let files: string[];
  try {
    files = listLatestStatusFiles(await fs.readdir(directory));
  } catch {
    return empty;
  }
  // One capture: do not silently fill missing measurements from older days.
  for (const file of files) {
    try {
      const raw: unknown = JSON.parse(
        await fs.readFile(path.join(directory, file), "utf8"),
      );
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const captured = conditionsFromCapture(raw);
      if (captured.weather) captured.weather.archived = true;
      if (captured.comment) captured.comment.archived = true;
      if (captured.news) captured.news.archived = true;
      return captured;
    } catch {
      /* Try the preceding valid capture. */
    }
  }
  return empty;
}
