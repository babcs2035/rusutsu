import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_MAP_DISPLAY_SETTINGS,
  type MapDisplaySettings,
  OPEN_COURSE_STATUSES,
} from "../utils/mapDisplaySettings";
import { MapCourseStatusControl } from "./MapCourseStatusControl";

const renderControl = (settings: MapDisplaySettings, checked: boolean) =>
  renderToStaticMarkup(
    createElement(MapCourseStatusControl, {
      enabled: true,
      checked,
      settings,
      onCheckedChange: () => {},
      onSettingsChange: () => {},
    }),
  );

test("個別の表示条件や古いチェック状態で営業中のみをオン表示しない", () => {
  const openOnly = {
    ...DEFAULT_MAP_DISPLAY_SETTINGS,
    courseStatuses: OPEN_COURSE_STATUSES,
  };
  assert.match(renderControl(openOnly, true), /aria-pressed="true"/);
  for (const settings of [
    DEFAULT_MAP_DISPLAY_SETTINGS,
    { ...openOnly, showCourses: false },
    {
      ...openOnly,
      courseStatuses: { ...OPEN_COURSE_STATUSES, unknown: true },
    },
    {
      ...openOnly,
      courseStatuses: {
        open: false,
        limited: false,
        closed: true,
        unknown: false,
      },
    },
  ]) {
    assert.match(renderControl(settings, true), /aria-pressed="false"/);
  }
  // 個別設定で○・△を選んでも、プリセットのボタンを押すまではチェックしない。
  assert.match(renderControl(openOnly, false), /aria-pressed="false"/);
});
