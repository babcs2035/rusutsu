import { SkizFormatError } from "./parseSkizArchive";

export type SkizParseResult = {
  metadata: {
    name: string;
    description: string;
    activity: string;
    start: string;
    finish: string;
    timezone: string;
    durationSeconds: number;
    resort: string | null;
  };
  nodes: Array<{
    time: number;
    longitude: number;
    latitude: number;
    altitude: number;
    speed: number;
  }>;
  segments: Array<{
    start: number;
    end: number;
    type: "lift" | "ski_run";
    sequence: number;
    name: string;
    durationSeconds: number;
    averageSpeed: number;
    distance: number;
    verticalChange: number;
  }>;
};

function decodeText(buffer: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(buffer)
      .replace(/^\uFEFF/, "");
  } catch {
    throw new SkizFormatError("ZIP entry is not valid UTF-8.");
  }
}

function xmlAttribute(xml: string, name: string): string {
  const match = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(xml);
  return (
    match?.[1]
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&apos;/g, "'") ?? ""
  );
}

function finite(value: string, label: string): number {
  if (value.trim() === "") throw new SkizFormatError(`${label} is missing.`);
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new SkizFormatError(`${label} is invalid.`);
  return number;
}

function parseMetadata(xml: string): SkizParseResult["metadata"] {
  const root = /<track\b[^>]*>/i.exec(xml)?.[0];
  if (!root) throw new SkizFormatError("Track metadata is invalid.");
  const name = xmlAttribute(root, "name");
  const description = xmlAttribute(root, "description");
  const activity = xmlAttribute(root, "activity");
  const start = xmlAttribute(root, "start");
  const finish = xmlAttribute(root, "finish");
  const timezone = xmlAttribute(root, "tz");
  const durationSeconds = finite(
    xmlAttribute(root, "duration"),
    "Track duration",
  );
  if (
    !name ||
    !start ||
    !finish ||
    activity !== "skiing" ||
    durationSeconds < 0
  )
    throw new SkizFormatError(
      "Track metadata is incomplete or not a ski track.",
    );
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(finish))
  )
    throw new SkizFormatError("Track timestamps are invalid.");
  const startMs = Date.parse(start);
  const finishMs = Date.parse(finish);
  if (finishMs <= startMs || finishMs - startMs > 7 * 24 * 60 * 60 * 1000)
    throw new SkizFormatError("Track time range is invalid.");
  if (Math.abs((finishMs - startMs) / 1000 - durationSeconds) > 5 * 60)
    throw new SkizFormatError("Track duration does not match its time range.");
  const resort =
    /(?:^|;)ja:([^;]+)/.exec(description)?.[1]?.trim() ||
    /(?:^|;)en:([^;]+)/.exec(description)?.[1]?.trim() ||
    null;
  return {
    name,
    description,
    activity,
    start,
    finish,
    timezone,
    durationSeconds,
    resort,
  };
}

function parseNodes(text: string): SkizParseResult["nodes"] {
  const lines = text.split(/\r?\n/);
  const nodes: SkizParseResult["nodes"] = [];
  let previousTime = -Infinity;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    const columns = line.split(",");
    if (columns.length !== 8)
      throw new SkizFormatError(`Nodes.csv row ${index + 1} is invalid.`);
    const seconds = finite(columns[0], "Node timestamp");
    const latitude = finite(columns[1], "Node latitude");
    const longitude = finite(columns[2], "Node longitude");
    const altitude = finite(columns[3], "Node altitude");
    const speed = finite(columns[5], "Node speed");
    const time = seconds * 1000;
    if (
      !Number.isSafeInteger(Math.trunc(time)) ||
      time <= previousTime ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      speed < -1
    )
      throw new SkizFormatError(
        `Nodes.csv row ${index + 1} contains invalid values.`,
      );
    const bearing = finite(columns[4], "Node bearing");
    if (bearing !== -1 && (bearing < 0 || bearing >= 360))
      throw new SkizFormatError(
        `Nodes.csv row ${index + 1} contains an invalid bearing.`,
      );
    finite(columns[6], "Node accuracy");
    finite(columns[7], "Node derived value");
    nodes.push({ time, longitude, latitude, altitude, speed });
    if (nodes.length > 200_000)
      throw new SkizFormatError("Track has too many location points.");
    previousTime = time;
  }
  if (nodes.length < 2)
    throw new SkizFormatError("Track has too few location points.");
  return nodes;
}

function parseSegments(
  text: string,
  metadata: SkizParseResult["metadata"],
): SkizParseResult["segments"] {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines[0]?.trim() !== "4")
    throw new SkizFormatError("Segment format version is unsupported.");
  const segments: SkizParseResult["segments"] = [];
  let previousStart = -Infinity;
  let previousEnd = -Infinity;
  const trackStart = Date.parse(metadata.start);
  const trackEnd = Date.parse(metadata.finish);
  for (let index = 1; index < lines.length; index++) {
    const columns = lines[index].split(",");
    if (columns.length !== 22)
      throw new SkizFormatError(`Segment.csv row ${index + 1} is invalid.`);
    const startSeconds = finite(columns[0], "Segment start");
    const endSeconds = finite(columns[1], "Segment end");
    const code = finite(columns[2], "Segment type");
    const sequence = finite(columns[4], "Segment sequence");
    const durationSeconds = finite(columns[11], "Segment duration");
    const averageSpeed = finite(columns[12], "Segment speed");
    const distance = finite(columns[13], "Segment distance");
    const verticalChange = finite(columns[14], "Segment vertical change");
    const type = code === 8 ? "ski_run" : code === 10 ? "lift" : null;
    const name = columns[5].trim();
    if (
      !type ||
      !Number.isInteger(sequence) ||
      sequence < 1 ||
      !name ||
      (type === "ski_run" && columns[7] !== "ski_run") ||
      (type === "lift" && columns[7] !== "ski_lift") ||
      endSeconds <= startSeconds ||
      startSeconds < previousStart ||
      startSeconds * 1000 < trackStart - 5 * 60 * 1000 ||
      endSeconds * 1000 > trackEnd + 5 * 60 * 1000 ||
      startSeconds * 1000 < previousEnd ||
      durationSeconds <= 0 ||
      averageSpeed < 0 ||
      distance < 0
    )
      throw new SkizFormatError(
        `Segment.csv row ${index + 1} contains invalid values.`,
      );
    segments.push({
      start: startSeconds * 1000,
      end: endSeconds * 1000,
      type,
      sequence,
      name,
      durationSeconds,
      averageSpeed,
      distance,
      verticalChange,
    });
    if (segments.length > 2_000)
      throw new SkizFormatError("Track has too many segments.");
    previousStart = startSeconds;
    previousEnd = endSeconds;
  }
  if (segments.length === 0)
    throw new SkizFormatError("Track has no ski segments.");
  return segments;
}

export function parseSkizContents(
  files: Map<string, Uint8Array>,
): SkizParseResult {
  const track = files.get("Track.xml");
  const nodeFile = files.get("Nodes.csv");
  const segmentFile = files.get("Segment.csv");
  if (!track || !nodeFile || !segmentFile) throw new SkizFormatError();
  const metadata = parseMetadata(decodeText(track));
  const nodes = parseNodes(decodeText(nodeFile));
  const segments = parseSegments(decodeText(segmentFile), metadata);
  return { metadata, nodes, segments };
}
