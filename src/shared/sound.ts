/**
 * Sound-effect settings (spec 15). Kept free of zod so the renderer can import
 * the type and defaults without pulling validation into its bundle.
 */
export interface SoundSettings {
  /** Button feedback cues; off by default: the handheld is often used at night. */
  enabled: boolean
  /** A click-like cue when the agent finishes a run; on by default. */
  completionEnabled: boolean
}

export const DEFAULT_SOUND: SoundSettings = { enabled: false, completionEnabled: true }
