/** Zoom bounds and clamping for the renderer's `webContents.setZoomFactor` (spec 03 section 7). */
export const MIN_ZOOM = 0.8
export const MAX_ZOOM = 2

export function clampZoom(factor: number): number {
  if (!Number.isFinite(factor)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor))
}
