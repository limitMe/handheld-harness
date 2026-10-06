import { z } from 'zod'
import { ACTION_IDS, type ActionId } from './actions'
import type { BindingLayer, BindingValue } from './input'
import type {
  ChatMessage,
  CommandInfo,
  EngineCapabilities,
  EngineEventPayload,
  EngineInfo,
  EngineSnapshot,
  ModelGroup,
  ModelRef,
  PermissionReply,
  SessionRef,
  SessionSummary,
} from './engine'

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

export const SessionRefSchema = z.object({
  engineId: z.string().min(1),
  sessionId: z.string().min(1),
})
export type SessionRefInput = z.infer<typeof SessionRefSchema>

export const ModelRefSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
})
export type ModelRefInput = z.infer<typeof ModelRefSchema>

export const EngineSettingsSchema = z.object({
  workspaceDir: z.string().optional(),
})
export type EngineSettings = z.infer<typeof EngineSettingsSchema>

export const UiSettingsSchema = z.object({
  // Null means "new task"; a ref reopens the last task on the next launch.
  lastSession: z.union([SessionRefSchema, z.null()]).optional(),
  zoom: z.number().min(0.8).max(2).default(1),
})
export type UiSettings = z.infer<typeof UiSettingsSchema>

const BindingValueSchema = z.union([z.enum(ACTION_IDS as [ActionId, ...ActionId[]]), z.null()])
const BindingRowsSchema = z.record(z.string(), z.record(z.string(), BindingValueSchema))

/** User key-binding layer persisted in `settings.input` (spec 10). */
export const BindingLayerSchema = z.object({
  contexts: BindingRowsSchema.default({}),
  keyboard: BindingRowsSchema.default({}),
})
export type { BindingLayer, BindingValue }

/** Partial override used by `settings.update`; missing rows keep their current value. */
export const BindingPatchSchema = z.object({
  contexts: BindingRowsSchema.optional(),
  keyboard: BindingRowsSchema.optional(),
})

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  window: z.object({
    mode: WindowModeSchema,
  }),
  engine: EngineSettingsSchema.default({}),
  ui: UiSettingsSchema.default({ zoom: 1 }),
  input: BindingLayerSchema.default({ contexts: {}, keyboard: {} }),
})
export type Settings = z.infer<typeof SettingsSchema>

export const SettingsPatchSchema = z.object({
  window: z
    .object({
      mode: WindowModeSchema.optional(),
    })
    .optional(),
  engine: z
    .object({
      workspaceDir: z.string().optional(),
    })
    .optional(),
  ui: z
    .object({
      lastSession: z.union([SessionRefSchema, z.null()]).optional(),
      zoom: z.number().optional(),
    })
    .optional(),
  input: BindingPatchSchema.optional(),
})
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  window: { mode: 'windowed' },
  engine: {},
  ui: { zoom: 1 },
  input: { contexts: {}, keyboard: {} },
}

export const LogWriteRequestSchema = z.object({
  level: LogLevelSchema,
  message: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
})
export type LogWriteRequest = z.infer<typeof LogWriteRequestSchema>

// ----- engine IPC schemas -------------------------------------------------

export const PermissionReplySchema = z.enum(['once', 'always', 'reject'])
export type PermissionReplyInput = z.infer<typeof PermissionReplySchema>

export const EngineIdParamSchema = z.object({ engineId: z.string().optional() }).optional()
export const SessionRefParamSchema = z.object({ ref: SessionRefSchema })
export const CreateSessionParamSchema = z
  .object({
    opts: z
      .object({
        title: z.string().optional(),
        model: ModelRefSchema.optional(),
      })
      .optional(),
    engineId: z.string().optional(),
  })
  .optional()

export interface EngineApi {
  capabilities(engineId?: string): Promise<EngineCapabilities>
  snapshot(engineId?: string): Promise<EngineSnapshot>
  listSessions(engineId?: string): Promise<SessionSummary[]>
  createSession(
    opts?: { title?: string; model?: ModelRef },
    engineId?: string,
  ): Promise<SessionSummary>
  deleteSession(ref: SessionRef): Promise<void>
  getMessages(ref: SessionRef): Promise<ChatMessage[]>
  setSessionModel(ref: SessionRef, model: ModelRef): Promise<void>
  prompt(ref: SessionRef, input: { text: string }): Promise<void>
  abort(ref: SessionRef): Promise<void>
  replyPermission(ref: SessionRef, requestId: string, reply: PermissionReply): Promise<void>
  replyQuestion(ref: SessionRef, requestId: string, answers: string[][]): Promise<void>
  rejectQuestion(ref: SessionRef, requestId: string): Promise<void>
  listModels(engineId?: string): Promise<ModelGroup[]>
  listCommands(engineId?: string): Promise<CommandInfo[]>
  list(): Promise<EngineInfo[]>
  restart(engineId?: string): Promise<void>
  onEvent(listener: (payload: EngineEventPayload) => void): () => void
}

export interface InvokeContract {
  'app:getInfo': { request: undefined; response: AppInfo }
  'app:openExternal': { request: { url: string }; response: void }
  'window:setZoom': { request: { factor: number }; response: { zoom: number } }
  'log:write': { request: LogWriteRequest; response: void }
  'settings:get': { request: undefined; response: Settings }
  'settings:update': { request: SettingsPatch; response: Settings }
  'engine:capabilities': {
    request: { engineId?: string } | undefined
    response: EngineCapabilities
  }
  'engine:snapshot': { request: { engineId?: string } | undefined; response: EngineSnapshot }
  'engine:listSessions': { request: { engineId?: string } | undefined; response: SessionSummary[] }
  'engine:createSession': {
    request: { opts?: { title?: string; model?: ModelRef }; engineId?: string } | undefined
    response: SessionSummary
  }
  'engine:deleteSession': { request: { ref: SessionRef }; response: void }
  'engine:getMessages': { request: { ref: SessionRef }; response: ChatMessage[] }
  'engine:setSessionModel': { request: { ref: SessionRef; model: ModelRef }; response: void }
  'engine:prompt': { request: { ref: SessionRef; input: { text: string } }; response: void }
  'engine:abort': { request: { ref: SessionRef }; response: void }
  'engine:replyPermission': {
    request: { ref: SessionRef; requestId: string; reply: PermissionReply }
    response: void
  }
  'engine:replyQuestion': {
    request: { ref: SessionRef; requestId: string; answers: string[][] }
    response: void
  }
  'engine:rejectQuestion': { request: { ref: SessionRef; requestId: string }; response: void }
  'engine:listModels': { request: { engineId?: string } | undefined; response: ModelGroup[] }
  'engine:listCommands': { request: { engineId?: string } | undefined; response: CommandInfo[] }
  'engine:list': { request: undefined; response: EngineInfo[] }
  'engine:restart': { request: { engineId?: string } | undefined; response: void }
}

export interface EventContract {
  'settings:changed': { payload: Settings }
  'engine:event': { payload: EngineEventPayload }
}

export type InvokeChannel = keyof InvokeContract
export type EventChannel = keyof EventContract

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'app:openExternal',
  'window:setZoom',
  'log:write',
  'settings:get',
  'settings:update',
  'engine:capabilities',
  'engine:snapshot',
  'engine:listSessions',
  'engine:createSession',
  'engine:deleteSession',
  'engine:getMessages',
  'engine:setSessionModel',
  'engine:prompt',
  'engine:abort',
  'engine:replyPermission',
  'engine:replyQuestion',
  'engine:rejectQuestion',
  'engine:listModels',
  'engine:listCommands',
  'engine:list',
  'engine:restart',
] as const satisfies readonly InvokeChannel[]

export const EVENT_CHANNELS = [
  'settings:changed',
  'engine:event',
] as const satisfies readonly EventChannel[]

export const IPC_INVOKE_SCHEMAS = {
  'app:getInfo': z.undefined(),
  'app:openExternal': z.object({ url: z.string().min(1) }),
  'window:setZoom': z.object({ factor: z.number() }),
  'log:write': LogWriteRequestSchema,
  'settings:get': z.undefined(),
  'settings:update': SettingsPatchSchema,
  'engine:capabilities': EngineIdParamSchema,
  'engine:snapshot': EngineIdParamSchema,
  'engine:listSessions': EngineIdParamSchema,
  'engine:createSession': CreateSessionParamSchema,
  'engine:deleteSession': SessionRefParamSchema,
  'engine:getMessages': SessionRefParamSchema,
  'engine:setSessionModel': z.object({ ref: SessionRefSchema, model: ModelRefSchema }),
  'engine:prompt': z.object({ ref: SessionRefSchema, input: z.object({ text: z.string() }) }),
  'engine:abort': SessionRefParamSchema,
  'engine:replyPermission': z.object({
    ref: SessionRefSchema,
    requestId: z.string(),
    reply: PermissionReplySchema,
  }),
  'engine:replyQuestion': z.object({
    ref: SessionRefSchema,
    requestId: z.string(),
    answers: z.array(z.array(z.string())),
  }),
  'engine:rejectQuestion': z.object({ ref: SessionRefSchema, requestId: z.string() }),
  'engine:listModels': EngineIdParamSchema,
  'engine:listCommands': EngineIdParamSchema,
  'engine:list': z.undefined(),
  'engine:restart': EngineIdParamSchema,
} satisfies Record<InvokeChannel, z.ZodType>

/** Renderer-facing API exposed by the preload bridge on `window.handheld`. */
export interface HandheldApi {
  app: {
    getInfo(): Promise<AppInfo>
    openExternal(url: string): Promise<void>
  }
  window: {
    setZoom(factor: number): Promise<{ zoom: number }>
  }
  log: {
    write(level: LogLevel, message: string, meta?: Record<string, unknown>): void
  }
  settings: {
    get(): Promise<Settings>
    update(patch: SettingsPatch): Promise<Settings>
  }
  engine: EngineApi
  events: {
    on<K extends EventChannel>(
      channel: K,
      listener: (payload: EventContract[K]['payload']) => void,
    ): () => void
  }
}
