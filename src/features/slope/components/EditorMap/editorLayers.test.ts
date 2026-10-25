import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import {
  CORRECTION_ACTIVE_COURSE_WIDTH,
  CORRECTION_COURSE_WIDTH,
  createEditorLayers,
  EDITOR_LAYER,
  EDITOR_SOURCE,
} from "./editorLayers";

const require = createRequire(
  realpathSync("node_modules/maplibre-gl/package.json"),
);
const { validateStyleMin } = require("@maplibre/maplibre-gl-style-spec") as {
  validateStyleMin: (style: unknown) => Array<{ message: string }>;
};

test("editor and correction preview layers satisfy the MapLibre style specification", () => {
  for (const preview of [false, true]) {
    const layers = createEditorLayers().map(layer => {
      if (!preview || layer.type !== "line") return layer;
      const width =
        layer.id === EDITOR_LAYER.lineInactive
          ? CORRECTION_COURSE_WIDTH
          : [
                EDITOR_LAYER.lineActive,
                EDITOR_LAYER.correctionUngroomedMask,
                EDITOR_LAYER.correctionVariableMask,
              ].includes(layer.id as typeof EDITOR_LAYER.lineActive)
            ? CORRECTION_ACTIVE_COURSE_WIDTH
            : undefined;
      return width
        ? { ...layer, paint: { ...layer.paint, "line-width": width } }
        : layer;
    });
    const errors = validateStyleMin({
      version: 8,
      sources: Object.fromEntries(
        Object.values(EDITOR_SOURCE).map(id => [
          id,
          {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
        ]),
      ),
      layers,
    });
    assert.deepEqual(
      errors.map(error => error.message),
      [],
    );
  }
});
