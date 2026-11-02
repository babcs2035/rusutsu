export const COMPOSER_PANEL_HEIGHTS = [40, 70] as const;

export function snapComposerPanelHeight(height: number): 40 | 70 {
  if (!Number.isFinite(height)) return 70;
  return height < 55 ? 40 : 70;
}

export function resolveComposerPanelHeight(
  height: number,
  upwardVelocity: number,
  areaHeight: number,
): 40 | 70 {
  if (!Number.isFinite(height)) return 70;
  const projectedHeight =
    height +
    (Number.isFinite(upwardVelocity) && areaHeight > 0
      ? (upwardVelocity * 180 * 100) / areaHeight
      : 0);
  return snapComposerPanelHeight(projectedHeight);
}
