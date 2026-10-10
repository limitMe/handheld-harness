/**
 * Button sound-effect settings (spec 15). Kept free of zod so the renderer can
 * import the type and defaults without pulling validation into its bundle.
 *
 * Off by default: the handheld is often used at night, next to someone else.
 */
export interface SoundSettings {
  enabled: boolean
}

export const DEFAULT_SOUND: SoundSettings = { enabled: false }
