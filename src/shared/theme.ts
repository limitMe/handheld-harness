import type { ThemeMode } from './ipc'

export type ResolvedTheme = 'dark' | 'light'

/** Resolves a theme mode against the OS preference (spec 18). */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light'
  return mode
}

/**
 * BrowserWindow background colors. Kept in sync with `--theme-color-surface` in
 * `styles/theme/default.css` (dark) and `styles/theme/light.css` (light) so the
 * window does not flash the wrong color before the renderer paints.
 */
export const THEME_SURFACE_COLOR: Record<ResolvedTheme, string> = {
  dark: '#0b0d10',
  light: '#eef0f4',
}
