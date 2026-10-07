import { THEME_MODES, type ThemeMode } from '@shared/ipc'
import { resolveTheme, type ResolvedTheme } from '@shared/theme'

export { resolveTheme, type ResolvedTheme }

const DARK_QUERY = '(prefers-color-scheme: dark)'

const LABELS: Record<ThemeMode, string> = {
  system: 'Follow system',
  dark: 'Dark',
  light: 'Light',
}

/** Cycles through the theme modes, used by the left/right adjust gesture. */
export function nextTheme(mode: ThemeMode, direction: -1 | 1): ThemeMode {
  const index = THEME_MODES.indexOf(mode)
  const next = (index + direction + THEME_MODES.length) % THEME_MODES.length
  return THEME_MODES[next] ?? mode
}

export function themeLabel(mode: ThemeMode): string {
  return LABELS[mode]
}

/** Reflects the resolved theme onto <html>, where the theme CSS keys off it. */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
}

export function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}
