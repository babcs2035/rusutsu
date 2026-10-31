import assert from "node:assert/strict";
import test from "node:test";
import {
  getCommunityMapState,
  setCommunityComposeActive,
  setCommunityMapPickMode,
  setCommunityMapPoint,
} from "./composerEvents";

test("late-loaded maps recover compose mode and restored location, and closing clears them", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    value: new EventTarget(),
    configurable: true,
  });
  try {
    setCommunityComposeActive("late-map", true);
    setCommunityMapPickMode("late-map", "POINT");
    setCommunityMapPoint("late-map", [140, 43]);
    assert.deepEqual(getCommunityMapState("late-map"), {
      active: true,
      mode: "POINT",
      point: [140, 43],
    });
    assert.equal(getCommunityMapState("other-map").active, false);
    setCommunityComposeActive("late-map", false);
    assert.deepEqual(getCommunityMapState("late-map"), {
      active: false,
      mode: null,
      point: null,
    });
  } finally {
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
