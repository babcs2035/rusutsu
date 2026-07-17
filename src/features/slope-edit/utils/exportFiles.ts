import type { EditorCourse } from "../types";

const toNumberOrEmpty = (value: string): number | "" => {
  if (value.trim() === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
};

// slope_before と同じ形式（properties は name のみ）の GeoJSON
export const buildRusutsuGeojson = (courses: EditorCourse[]): string =>
  JSON.stringify(
    {
      type: "FeatureCollection",
      features: courses.map(course => ({
        type: "Feature",
        properties: { name: course.name },
        geometry: {
          type: "LineString",
          coordinates: course.coordinates,
        },
      })),
    },
    null,
    2,
  );

// slope_detail/<resortId>.json と同じ形式の配列
export const buildSlopeDetailJson = (
  resortId: string,
  courses: EditorCourse[],
): string =>
  JSON.stringify(
    courses.map(course => ({
      maxWidth: "",
      minWidth: "",
      snowboard: "",
      ...(course.detailExtras ?? {}),
      resort: resortId,
      name: course.name,
      level: course.detail.level,
      distance: toNumberOrEmpty(course.detail.distance),
      avg: toNumberOrEmpty(course.detail.avg),
      max: toNumberOrEmpty(course.detail.max),
      piste: course.detail.piste,
      morning: course.detail.morning,
      night: course.detail.night,
    })),
    null,
    2,
  );

// 詳細情報を properties に含めた標準 GeoJSON
export const buildStandardGeojson = (courses: EditorCourse[]): string =>
  JSON.stringify(
    {
      type: "FeatureCollection",
      features: courses.map(course => ({
        type: "Feature",
        properties: {
          name: course.name,
          level: course.detail.level,
          distance: toNumberOrEmpty(course.detail.distance),
          avg: toNumberOrEmpty(course.detail.avg),
          max: toNumberOrEmpty(course.detail.max),
          piste: course.detail.piste,
          morning: course.detail.morning,
          night: course.detail.night,
        },
        geometry: {
          type: "LineString",
          coordinates: course.coordinates,
        },
      })),
    },
    null,
    2,
  );

const escapeCsvCell = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const buildCsv = (courses: EditorCourse[]): string => {
  const rows = ["name,longitude,latitude,order"];
  for (const course of courses) {
    course.coordinates.forEach((coordinate, index) => {
      rows.push(
        [
          escapeCsvCell(course.name),
          String(coordinate[0]),
          String(coordinate[1]),
          String(index + 1),
        ].join(","),
      );
    });
  }
  return `${rows.join("\n")}\n`;
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const buildKml = (title: string, courses: EditorCourse[]): string => {
  const placemarks = courses
    .map(course => {
      const coordinates = course.coordinates
        .map(coordinate => `${coordinate[0]},${coordinate[1]},0`)
        .join(" ");
      return [
        "    <Placemark>",
        `      <name>${escapeXml(course.name)}</name>`,
        "      <LineString>",
        `        <coordinates>${coordinates}</coordinates>`,
        "      </LineString>",
        "    </Placemark>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "  <Document>",
    `    <name>${escapeXml(title)}</name>`,
    placemarks,
    "  </Document>",
    "</kml>",
    "",
  ].join("\n");
};

export const buildGpx = (title: string, courses: EditorCourse[]): string => {
  const tracks = courses
    .map(course => {
      const points = course.coordinates
        .map(
          coordinate =>
            `      <trkpt lat="${coordinate[1]}" lon="${coordinate[0]}"/>`,
        )
        .join("\n");
      return [
        "  <trk>",
        `    <name>${escapeXml(course.name)}</name>`,
        "    <trkseg>",
        points,
        "    </trkseg>",
        "  </trk>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(title)}" xmlns="http://www.topografix.com/GPX/1/1">`,
    tracks,
    "</gpx>",
    "",
  ].join("\n");
};

export const downloadTextFile = (
  fileName: string,
  content: string,
  mimeType: string,
): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
