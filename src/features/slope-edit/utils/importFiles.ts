import type { EditorCourse, LngLat } from "../types";
import { createEmptyCourse } from "./courseOps";

export type ImportResult = {
  courses: EditorCourse[];
  skipped: number;
};

const toLngLat = (value: unknown): LngLat | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
};

const toLineCoordinates = (value: unknown): LngLat[] | null => {
  if (!Array.isArray(value)) return null;
  const coordinates = value
    .map(toLngLat)
    .filter((coordinate): coordinate is LngLat => coordinate !== null);
  return coordinates.length >= 2 ? coordinates : null;
};

const buildCourse = (name: string, coordinates: LngLat[]): EditorCourse => ({
  ...createEmptyCourse(),
  name,
  coordinates,
});

const parseGeojson = (text: string): ImportResult => {
  const parsed: unknown = JSON.parse(text);
  const root = parsed as Record<string, unknown>;

  const features: Array<Record<string, unknown>> =
    root.type === "FeatureCollection" && Array.isArray(root.features)
      ? (root.features as Array<Record<string, unknown>>)
      : root.type === "Feature"
        ? [root]
        : [];

  if (features.length === 0) {
    throw new Error("FeatureCollection または Feature が見つかりません。");
  }

  const courses: EditorCourse[] = [];
  let skipped = 0;

  for (const feature of features) {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const name = typeof properties.name === "string" ? properties.name : "";
    const geometry = (feature.geometry ?? {}) as Record<string, unknown>;

    if (geometry.type === "LineString") {
      const coordinates = toLineCoordinates(geometry.coordinates);
      if (coordinates) {
        courses.push(buildCourse(name, coordinates));
        continue;
      }
    } else if (
      geometry.type === "MultiLineString" &&
      Array.isArray(geometry.coordinates)
    ) {
      const lines = (geometry.coordinates as unknown[])
        .map(toLineCoordinates)
        .filter((line): line is LngLat[] => line !== null);
      if (lines.length > 0) {
        lines.forEach((line, index) => {
          const suffix = lines.length > 1 ? `_${index + 1}` : "";
          courses.push(
            buildCourse(name === "" ? "" : `${name}${suffix}`, line),
          );
        });
        continue;
      }
    }
    skipped += 1;
  }

  return { courses, skipped };
};

const parseXml = (text: string): Document => {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("XML の解析に失敗しました。");
  }
  return document;
};

const parseKml = (text: string): ImportResult => {
  const document = parseXml(text);
  const placemarks = Array.from(document.getElementsByTagName("Placemark"));
  const courses: EditorCourse[] = [];
  let skipped = 0;

  for (const placemark of placemarks) {
    const name =
      placemark.getElementsByTagName("name")[0]?.textContent?.trim() ?? "";
    const lineStrings = Array.from(
      placemark.getElementsByTagName("LineString"),
    );
    if (lineStrings.length === 0) {
      skipped += 1;
      continue;
    }
    for (const lineString of lineStrings) {
      const raw =
        lineString.getElementsByTagName("coordinates")[0]?.textContent ?? "";
      const coordinates = raw
        .trim()
        .split(/\s+/)
        .map(token => toLngLat(token.split(",")))
        .filter((coordinate): coordinate is LngLat => coordinate !== null);
      if (coordinates.length >= 2) {
        courses.push(buildCourse(name, coordinates));
      } else {
        skipped += 1;
      }
    }
  }

  return { courses, skipped };
};

const parseGpx = (text: string): ImportResult => {
  const document = parseXml(text);
  const courses: EditorCourse[] = [];
  let skipped = 0;

  const readPoints = (parent: Element, tagName: string): LngLat[] =>
    Array.from(parent.getElementsByTagName(tagName))
      .map(point =>
        toLngLat([point.getAttribute("lon"), point.getAttribute("lat")]),
      )
      .filter((coordinate): coordinate is LngLat => coordinate !== null);

  for (const track of Array.from(document.getElementsByTagName("trk"))) {
    const name =
      track.getElementsByTagName("name")[0]?.textContent?.trim() ?? "";
    const segments = Array.from(track.getElementsByTagName("trkseg"));
    const lines =
      segments.length > 0
        ? segments.map(segment => readPoints(segment, "trkpt"))
        : [readPoints(track, "trkpt")];
    const validLines = lines.filter(line => line.length >= 2);
    if (validLines.length === 0) {
      skipped += 1;
      continue;
    }
    validLines.forEach((line, index) => {
      const suffix = validLines.length > 1 ? `_${index + 1}` : "";
      courses.push(buildCourse(name === "" ? "" : `${name}${suffix}`, line));
    });
  }

  for (const route of Array.from(document.getElementsByTagName("rte"))) {
    const name =
      route.getElementsByTagName("name")[0]?.textContent?.trim() ?? "";
    const coordinates = readPoints(route, "rtept");
    if (coordinates.length >= 2) {
      courses.push(buildCourse(name, coordinates));
    } else {
      skipped += 1;
    }
  }

  return { courses, skipped };
};

// 1 行を CSV としてパースする（ダブルクォート対応）
const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
};

// name,longitude,latitude,order 形式の CSV を LineString 群へ変換する
const parseCsv = (text: string): ImportResult => {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== "");
  if (lines.length < 2) {
    throw new Error("CSV にデータ行がありません。");
  }

  const header = splitCsvLine(lines[0]).map(cell => cell.trim().toLowerCase());
  const nameIndex = header.indexOf("name");
  const lngIndex = header.indexOf("longitude");
  const latIndex = header.indexOf("latitude");
  const orderIndex = header.indexOf("order");
  if (nameIndex < 0 || lngIndex < 0 || latIndex < 0 || orderIndex < 0) {
    throw new Error(
      "CSV のヘッダーに name, longitude, latitude, order が必要です。",
    );
  }

  const pointsByName = new Map<
    string,
    Array<{ order: number; point: LngLat }>
  >();
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const name = (cells[nameIndex] ?? "").trim();
    const point = toLngLat([cells[lngIndex], cells[latIndex]]);
    const order = Number(cells[orderIndex]);
    if (!point || !Number.isFinite(order)) {
      skipped += 1;
      continue;
    }
    const list = pointsByName.get(name) ?? [];
    list.push({ order, point });
    pointsByName.set(name, list);
  }

  const courses: EditorCourse[] = [];
  for (const [name, entries] of pointsByName) {
    entries.sort((a, b) => a.order - b.order);
    const coordinates = entries.map(entry => entry.point);
    if (coordinates.length >= 2) {
      courses.push(buildCourse(name, coordinates));
    } else {
      skipped += 1;
    }
  }

  return { courses, skipped };
};

export const importCoursesFromFile = async (
  file: File,
): Promise<ImportResult> => {
  const text = await file.text();
  const extension = file.name.toLowerCase().split(".").pop() ?? "";

  switch (extension) {
    case "geojson":
    case "json":
      return parseGeojson(text);
    case "kml":
      return parseKml(text);
    case "gpx":
      return parseGpx(text);
    case "csv":
      return parseCsv(text);
    default:
      throw new Error(
        `対応していない拡張子です: .${extension}（geojson / json / kml / gpx / csv に対応）`,
      );
  }
};
