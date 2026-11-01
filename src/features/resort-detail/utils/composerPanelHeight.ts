export const COMPOSER_PANEL_HEIGHTS = [30, 50, 70] as const;

export function snapComposerPanelHeight(height: number): 30 | 50 | 70 {
  if (!Number.isFinite(height)) return 70;
  return height < 40 ? 30 : height < 60 ? 50 : 70;
}
