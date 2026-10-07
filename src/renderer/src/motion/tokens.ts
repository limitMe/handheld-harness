/*
 * Motion timing comes from the CSS tokens, so animations stay in sync with the
 * theme and no component hard-codes a duration (spec 18). Values are read once
 * from `:root` and cached; Motion expects seconds and cubic-bezier control points.
 */
export interface MotionTokens {
  fast: number
  ui: number
  scene: number
  ease: [number, number, number, number]
}

const FALLBACK: MotionTokens = {
  fast: 0.12,
  ui: 0.22,
  scene: 0.45,
  ease: [0.2, 0, 0, 1],
}

let cache: MotionTokens | undefined

function parseDuration(raw: string, fallbackSeconds: number): number {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return fallbackSeconds
  return raw.includes('ms') ? value / 1000 : value
}

function parseEase(
  raw: string,
  fallback: [number, number, number, number],
): [number, number, number, number] {
  const match = /cubic-bezier\(([^)]+)\)/.exec(raw)
  if (!match?.[1]) return fallback
  const parts = match[1].split(',').map((part) => Number.parseFloat(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return fallback
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!]
}

/** Reads the duration/easing tokens from the document root. */
export function motionTokens(): MotionTokens {
  if (cache) return cache
  if (typeof window === 'undefined') return FALLBACK
  const styles = getComputedStyle(document.documentElement)
  const tokens: MotionTokens = {
    fast: parseDuration(styles.getPropertyValue('--t-fast'), FALLBACK.fast),
    ui: parseDuration(styles.getPropertyValue('--t-ui'), FALLBACK.ui),
    scene: parseDuration(styles.getPropertyValue('--t-scene'), FALLBACK.scene),
    ease: parseEase(styles.getPropertyValue('--theme-ease-standard'), FALLBACK.ease),
  }
  cache = tokens
  return tokens
}
