/**
 * Action-hint settings (spec 12). Kept free of zod so the renderer can import
 * the type and defaults without pulling validation into its bundle.
 */
export interface HintsSettings {
  enabled: boolean
  delayMs: number
}

export const DEFAULT_HINTS: HintsSettings = { enabled: true, delayMs: 2000 }
