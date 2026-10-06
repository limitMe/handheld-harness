import { z } from 'zod'

export const WINDOW_MODES = ['windowed', 'fullscreen'] as const

export const WindowModeSchema = z.enum(['windowed', 'fullscreen'])
export type WindowMode = z.infer<typeof WindowModeSchema>

export const LogLevelSchema = z.enum(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
export type LogLevel = z.infer<typeof LogLevelSchema>

export const AppInfoSchema = z.object({
  version: z.string(),
  profile: z.string(),
  platform: z.string(),
  isDev: z.boolean(),
})
export type AppInfo = z.infer<typeof AppInfoSchema>

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  window: z.object({
    mode: WindowModeSchema,
  }),
})
export type Settings = z.infer<typeof SettingsSchema>

export const SettingsPatchSchema = z.object({
  window: z
    .object({
      mode: WindowModeSchema.optional(),
    })
    .optional(),
})
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  window: { mode: 'windowed' },
}

export const LogWriteRequestSchema = z.object({
  level: LogLevelSchema,
  message: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
})
export type LogWriteRequest = z.infer<typeof LogWriteRequestSchema>

export interface InvokeContract {
  'app:getInfo': { request: undefined; response: AppInfo }
  'log:write': { request: LogWriteRequest; response: void }
  'settings:get': { request: undefined; response: Settings }
  'settings:update': { request: SettingsPatch; response: Settings }
}

export interface EventContract {
  'settings:changed': { payload: Settings }
}

export type InvokeChannel = keyof InvokeContract
export type EventChannel = keyof EventContract

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'log:write',
  'settings:get',
  'settings:update',
] as const satisfies readonly InvokeChannel[]

export const EVENT_CHANNELS = ['settings:changed'] as const satisfies readonly EventChannel[]

export const IPC_INVOKE_SCHEMAS = {
  'app:getInfo': z.undefined(),
  'log:write': LogWriteRequestSchema,
  'settings:get': z.undefined(),
  'settings:update': SettingsPatchSchema,
} satisfies Record<InvokeChannel, z.ZodType>

/** Renderer-facing API exposed by the preload bridge on `window.handheld`. */
export interface HandheldApi {
  app: {
    getInfo(): Promise<AppInfo>
  }
  log: {
    write(level: LogLevel, message: string, meta?: Record<string, unknown>): void
  }
  settings: {
    get(): Promise<Settings>
    update(patch: SettingsPatch): Promise<Settings>
  }
  events: {
    on<K extends EventChannel>(channel: K, listener: (payload: EventContract[K]['payload']) => void): () => void
  }
}
