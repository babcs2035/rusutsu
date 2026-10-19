type ControlRect = Pick<
  DOMRect,
  "top" | "bottom" | "left" | "right" | "height"
>;

/** 同じ地図に重なっている操作だけを、上端の余白として数える。 */
export function getTopControlOverlapHeight(
  mapRect: ControlRect,
  controlRects: ControlRect[],
) {
  let bottom = 0;
  for (const rect of controlRects) {
    const overlapsHorizontally =
      rect.right > mapRect.left && rect.left < mapRect.right;
    const overlapsVertically =
      rect.bottom > mapRect.top && rect.top < mapRect.bottom;
    if (
      !overlapsHorizontally ||
      !overlapsVertically ||
      rect.height >= mapRect.height
    )
      continue;
    bottom = Math.max(bottom, rect.bottom - mapRect.top);
  }
  return Math.max(0, Math.min(mapRect.height, bottom));
}
