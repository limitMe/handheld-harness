import { z } from 'zod'
import { ACTION_IDS, type ActionId } from './actions'
import { DEFAULT_HINTS } from './hints'
import { DEFAULT_LANGUAGE, LANGUAGE_MODES } from './i18n'
import { RING_SLOTS } from './model-recents'
import type { BindingLayer, BindingValue } from './input'
import {
  DOUBAO_DEFAULT_ENDPOINT,
  DOUBAO_DEFAULT_RESOURCE_ID,
  SPEECH_DEFAULT_LANGUAGE,
  SPEECH_PROVIDER_NONE,
  type SpeechEvent,
  type SpeechProviderInfo,
} from './speech'
import type {
  ChatMessage,
  CommandInfo,
  CreateSessionOptions,
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

/** Light/dark themes, or follow the OS preference (spec 18). */
export const THEME_MODES = ['system', 'dark', 'light'] as const
export const ThemeModeSchema = z.enum(THEME_MODES)
export type ThemeMode = z.infer<typeof ThemeModeSchema>

/** UI language: follow the OS locale, or pick English / Simplified Chinese (spec 20). */
export const LanguageModeSchema = z.enum(LANGUAGE_MODES)
export type { LanguageMode } from './i18n'

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
  /** Analog stick scroll speed multiplier; see `SCROLL_PIXELS_PER_SECOND`. */
  scrollSpeed: z.number().min(0.25).max(2).default(1),
  /** Theme selection; `system` follows the OS light/dark preference (spec 18). */
  theme: ThemeModeSchema.default('system'),
  /** UI language; `system` follows the OS locale (spec 20). */
  language: LanguageModeSchema.default(DEFAULT_LANGUAGE),
})
export type UiSettings = z.infer<typeof UiSettingsSchema>

/** One entry of the recent-model ring (spec 14): a model plus its remembered sector. */
export const RecentModelSchema = z.object({
  model: ModelRefSchema,
  slot: z
    .number()
    .int()
    .min(0)
    .max(RING_SLOTS - 1),
  name: z.string().optional(),
})

/**
 * Model defaults (spec 15). New tasks use `model.default`; existing tasks keep
 * their own model (P-01). Null/absent means "let the engine decide".
 *
 * `recent` backs the task map's model ring (spec 14): the recently used models,
 * most recent first, each with the sector it was assigned.
 */
export const ModelSettingsSchema = z.object({
  default: z.union([ModelRefSchema, z.null()]).optional(),
  recent: z.array(RecentModelSchema).default([]),
})
export type ModelSettings = z.infer<typeof ModelSettingsSchema>

/** The settings-selectable speech providers (spec 16). `none` disables dictation;
 * the mock provider is test-only and must never appear here. */
export const SPEECH_PROVIDER_IDS = [SPEECH_PROVIDER_NONE, 'doubao'] as const
export type SpeechProviderId = (typeof SPEECH_PROVIDER_IDS)[number]

/** Provider-specific options for the Doubao (Volcengine) streaming adapter. */
export const DoubaoSpeechSettingsSchema = z.object({
  resourceId: z.string().min(1).default(DOUBAO_DEFAULT_RESOURCE_ID),
  endpoint: z.string().min(1).default(DOUBAO_DEFAULT_ENDPOINT),
})
export type DoubaoSpeechSettings = z.infer<typeof DoubaoSpeechSettingsSchema>

/**
 * Voice-input settings (spec 16). The API key is not here: it is encrypted with
 * the OS credential store and kept in a separate profile file (P-20).
 */
export const SpeechSettingsSchema = z.object({
  provider: z.enum(SPEECH_PROVIDER_IDS).default(SPEECH_PROVIDER_NONE),
  language: z.string().min(1).default(SPEECH_DEFAULT_LANGUAGE),
  doubao: DoubaoSpeechSettingsSchema.default({
    resourceId: DOUBAO_DEFAULT_RESOURCE_ID,
    endpoint: DOUBAO_DEFAULT_ENDPOINT,
  }),
})
export type SpeechSettings = z.infer<typeof SpeechSettingsSchema>

/** Action hints share one wait time everywhere and can be turned off entirely (spec 12, P-09). */
export const HintsSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  delayMs: z.number().int().min(0).max(60_000).default(DEFAULT_HINTS.delayMs),
})
export type { HintsSettings } from './hints'

/**
 * Task map state (spec 14). `open` is the ordered set of tasks shown on the map
 * (creation-time order); `unread` holds the sessions whose "finished while you
 * were away" red dot is still showing. Both are persisted per profile.
 */
export const TasksSettingsSchema = z.object({
  open: z.array(SessionRefSchema).default([]),
  unread: z.array(SessionRefSchema).default([]),
})
export type TasksSettings = z.infer<typeof TasksSettingsSchema>

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
  /** Contexts whose whole user override is dropped, falling back to the defaults (spec 15). */
  resetContexts: z.array(z.string()).optional(),
  resetKeyboard: z.array(z.string()).optional(),
})
export type BindingPatch = z.infer<typeof BindingPatchSchema>

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  window: z.object({
    mode: WindowModeSchema,
  }),
  engine: EngineSettingsSchema.default({}),
  ui: UiSettingsSchema.default({
    zoom: 1,
    scrollSpeed: 1,
    theme: 'system',
    language: DEFAULT_LANGUAGE,
  }),
  hints: HintsSettingsSchema.default({ ...DEFAULT_HINTS }),
  tasks: TasksSettingsSchema.default({ open: [], unread: [] }),
  model: ModelSettingsSchema.default({ recent: [] }),
  input: BindingLayerSchema.default({ contexts: {}, keyboard: {} }),
  speech: SpeechSettingsSchema.default({
    provider: SPEECH_PROVIDER_NONE,
    language: SPEECH_DEFAULT_LANGUAGE,
    doubao: { resourceId: DOUBAO_DEFAULT_RESOURCE_ID, endpoint: DOUBAO_DEFAULT_ENDPOINT },
  }),
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
      scrollSpeed: z.number().optional(),
      theme: ThemeModeSchema.optional(),
      language: LanguageModeSchema.optional(),
    })
    .optional(),
  hints: z
    .object({
      enabled: z.boolean().optional(),
      delayMs: z.number().int().min(0).max(60_000).optional(),
    })
    .optional(),
  tasks: z
    .object({
      open: z.array(SessionRefSchema).optional(),
      unread: z.array(SessionRefSchema).optional(),
    })
    .optional(),
  model: z
    .object({
      default: z.union([ModelRefSchema, z.null()]).optional(),
      recent: z.array(RecentModelSchema).optional(),
    })
    .optional(),
  input: BindingPatchSchema.optional(),
  speech: z
    .object({
      provider: z.enum(SPEECH_PROVIDER_IDS).optional(),
      language: z.string().min(1).optional(),
      doubao: z
        .object({
          resourceId: z.string().min(1).optional(),
          endpoint: z.string().min(1).optional(),
        })
        .optional(),
    })
    .optional(),
})
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  window: { mode: 'windowed' },
  engine: {},
  ui: { zoom: 1, scrollSpeed: 1, theme: 'system', language: DEFAULT_LANGUAGE },
  hints: { ...DEFAULT_HINTS },
  tasks: { open: [], unread: [] },
  model: { recent: [] },
  input: { contexts: {}, keyboard: {} },
  speech: {
    provider: SPEECH_PROVIDER_NONE,
    language: SPEECH_DEFAULT_LANGUAGE,
    doubao: { resourceId: DOUBAO_DEFAULT_RESOURCE_ID, endpoint: DOUBAO_DEFAULT_ENDPOINT },
  },
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
        effort: z.string().optional(),
        directory: z.string().optional(),
      })
      .optional(),
    engineId: z.string().optional(),
  })
  .optional()

export interface EngineApi {
  capabilities(engineId?: string): Promise<EngineCapabilities>
  snapshot(engineId?: string): Promise<EngineSnapshot>
  listSessions(engineId?: string): Promise<SessionSummary[]>
  createSession(opts?: CreateSessionOptions, engineId?: string): Promise<SessionSummary>
  deleteSession(ref: SessionRef): Promise<void>
  getMessages(ref: SessionRef): Promise<ChatMessage[]>
  setSessionModel(ref: SessionRef, model: ModelRef): Promise<void>
  setSessionEffort(ref: SessionRef, effort: string): Promise<void>
  prompt(ref: SessionRef, input: { text: string }): Promise<void>
  abort(ref: SessionRef): Promise<void>
  replyPermission(ref: SessionRef, requestId: string, reply: PermissionReply): Promise<void>
  replyQuestion(ref: SessionRef, requestId: string, answers: string[][]): Promise<void>
  rejectQuestion(ref: SessionRef, requestId: string): Promise<void>
  listModels(engineId?: string): Promise<ModelGroup[]>
  listCommands(engineId?: string): Promise<CommandInfo[]>
  runCommand(ref: SessionRef, command: string, args?: string): Promise<void>
  list(): Promise<EngineInfo[]>
  restart(engineId?: string): Promise<void>
  onEvent(listener: (payload: EngineEventPayload) => void): () => void
}

export interface InvokeContract {
  'app:getInfo': { request: undefined; response: AppInfo }
  'app:openExternal': { request: { url: string }; response: void }
  'app:openLogDir': { request: undefined; response: void }
  'app:showOnScreenKeyboard': { request: undefined; response: void }
  /** Native folder picker for a session's working directory (spec 21). */
  'app:pickDirectory': { request: undefined; response: { path: string | null } }
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
    request: { opts?: CreateSessionOptions; engineId?: string } | undefined
    response: SessionSummary
  }
  'engine:deleteSession': { request: { ref: SessionRef }; response: void }
  'engine:getMessages': { request: { ref: SessionRef }; response: ChatMessage[] }
  'engine:setSessionModel': { request: { ref: SessionRef; model: ModelRef }; response: void }
  'engine:setSessionEffort': { request: { ref: SessionRef; effort: string }; response: void }
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
  'engine:runCommand': {
    request: { ref: SessionRef; command: string; args?: string }
    response: void
  }
  'engine:list': { request: undefined; response: EngineInfo[] }
  'engine:restart': { request: { engineId?: string } | undefined; response: void }
  'speech:providers': { request: undefined; response: SpeechProviderInfo[] }
  'speech:keyStatus': { request: { providerId: string }; response: { configured: boolean } }
  'speech:setKey': { request: { providerId: string; apiKey: string }; response: void }
  'speech:clearKey': { request: { providerId: string }; response: void }
  'speech:start': {
    request: { language?: string; hints?: string[] } | undefined
    response: { sessionId: string }
  }
  'speech:pushAudio': { request: { sessionId: string; pcm: Uint8Array }; response: void }
  'speech:stop': { request: { sessionId: string }; response: void }
  'speech:cancel': { request: { sessionId: string }; response: void }
}

export interface EventContract {
  'settings:changed': { payload: Settings }
  'engine:event': { payload: EngineEventPayload }
  'speech:event': { payload: SpeechEvent }
}

export type InvokeChannel = keyof InvokeContract
export type EventChannel = keyof EventContract

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'app:openExternal',
  'app:openLogDir',
  'app:showOnScreenKeyboard',
  'app:pickDirectory',
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
  'engine:setSessionEffort',
  'engine:prompt',
  'engine:abort',
  'engine:replyPermission',
  'engine:replyQuestion',
  'engine:rejectQuestion',
  'engine:listModels',
  'engine:listCommands',
  'engine:runCommand',
  'engine:list',
  'engine:restart',
  'speech:providers',
  'speech:keyStatus',
  'speech:setKey',
  'speech:clearKey',
  'speech:start',
  'speech:pushAudio',
  'speech:stop',
  'speech:cancel',
] as const satisfies readonly InvokeChannel[]

export const EVENT_CHANNELS = [
  'settings:changed',
  'engine:event',
  'speech:event',
] as const satisfies readonly EventChannel[]

export const IPC_INVOKE_SCHEMAS = {
  'app:getInfo': z.undefined(),
  'app:openExternal': z.object({ url: z.string().min(1) }),
  'app:openLogDir': z.undefined(),
  'app:showOnScreenKeyboard': z.undefined(),
  'app:pickDirectory': z.undefined(),
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
  'engine:setSessionEffort': z.object({ ref: SessionRefSchema, effort: z.string().min(1) }),
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
  'engine:runCommand': z.object({
    ref: SessionRefSchema,
    command: z.string().min(1),
    args: z.string().optional(),
  }),
  'engine:list': z.undefined(),
  'engine:restart': EngineIdParamSchema,
  'speech:providers': z.undefined(),
  'speech:keyStatus': z.object({ providerId: z.string().min(1) }),
  'speech:setKey': z.object({ providerId: z.string().min(1), apiKey: z.string().min(1) }),
  'speech:clearKey': z.object({ providerId: z.string().min(1) }),
  'speech:start': z
    .object({ language: z.string().min(1).optional(), hints: z.array(z.string()).optional() })
    .optional(),
  'speech:pushAudio': z.object({
    sessionId: z.string().min(1),
    pcm: z.instanceof(Uint8Array),
  }),
  'speech:stop': z.object({ sessionId: z.string().min(1) }),
  'speech:cancel': z.object({ sessionId: z.string().min(1) }),
} satisfies Record<InvokeChannel, z.ZodType>

/** Renderer-facing API exposed by the preload bridge on `window.handheld`. */
export interface HandheldApi {
  app: {
    getInfo(): Promise<AppInfo>
    openExternal(url: string): Promise<void>
    openLogDir(): Promise<void>
    showOnScreenKeyboard(): Promise<void>
    pickDirectory(): Promise<{ path: string | null }>
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
  speech: {
    providers(): Promise<SpeechProviderInfo[]>
    keyStatus(providerId: string): Promise<{ configured: boolean }>
    setKey(providerId: string, apiKey: string): Promise<void>
    clearKey(providerId: string): Promise<void>
    start(opts?: { language?: string; hints?: string[] }): Promise<{ sessionId: string }>
    pushAudio(sessionId: string, pcm: Uint8Array): Promise<void>
    stop(sessionId: string): Promise<void>
    cancel(sessionId: string): Promise<void>
    onEvent(listener: (event: SpeechEvent) => void): () => void
  }
  events: {
    on<K extends EventChannel>(
      channel: K,
      listener: (payload: EventContract[K]['payload']) => void,
    ): () => void
  }
}
