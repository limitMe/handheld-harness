import { create } from 'zustand'
import type {
  CommandInfo,
  EngineEventPayload,
  EngineSnapshot,
  ModelRef,
  PermissionReply,
  SessionRef,
  SessionSummary,
} from '@shared/engine'
import { showToast } from '../ui/Toast'
import { i18n } from '../i18n'
import { touchRecentModel, type RecentModel } from '@shared/model-recents'
import { parseSlashCommand } from '../workbench/commands'
import { applyEngineEvent } from './applyEngineEvent'
import {
  initialWorkbenchState,
  insertByCreatedAt,
  keyParts,
  omitKey,
  sameSessionRef,
  sessionKey,
  type AnsweredChoice,
  type TasksState,
  type WorkbenchState,
} from './types'

const NEW_TASK_KEY = 'new-task'

/** Commands barely change, so one fetch per engine is enough for slash dispatch. */
const commandCache = new Map<string, CommandInfo[]>()

async function isKnownCommand(engineId: string, name: string): Promise<boolean> {
  const bridge = window.handheld?.engine
  if (!bridge) return false
  let commands = commandCache.get(engineId)
  if (!commands) {
    try {
      commands = await bridge.listCommands(engineId)
      commandCache.set(engineId, commands)
    } catch {
      return false
    }
  }
  return commands.some((command) => command.name === name)
}

/** Human-readable text for a failed engine call; IPC rejections are Errors. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface WorkbenchStore extends WorkbenchState {
  defaultEngineId?: string
  /** Model new tasks are created with (spec 15, `settings.model.default`). */
  defaultModel?: ModelRef
  /** Model the engine falls back to when no default is chosen (spec 21). */
  engineDefaultModel?: ModelRef
  /** Recently used models backing the task map's model ring (spec 14). */
  recentModels: RecentModel[]
  /** Working directory picked for the next new task (spec 21); engine default when unset. */
  pendingDirectory?: string
  /** Reasoning effort picked for the next new task (spec 21). */
  pendingEffort?: string
  initialized: boolean
  initialize(): Promise<void>
  handleEngineEvent(payload: EngineEventPayload): void
  refreshEngine(engineId: string): Promise<void>
  reconcileTasks(): void
  openSession(ref: SessionRef): Promise<void>
  closeTask(ref: SessionRef): Promise<void>
  newTask(): void
  setDefaultModel(model: ModelRef, name?: string): Promise<void>
  setPendingDirectory(directory: string | undefined): void
  setPendingEffort(effort: string | undefined): void
  setSessionEffort(ref: SessionRef, effort: string): Promise<void>
  draftKey(): string
  setDraft(value: string): void
  sendCurrent(): Promise<void>
  abortCurrent(): Promise<void>
  replyPermission(requestId: string, reply: PermissionReply): Promise<void>
  replyQuestion(requestId: string, answers: string[][]): Promise<void>
  rejectQuestion(requestId: string): Promise<void>
  loadMessages(ref: SessionRef, force?: boolean): Promise<void>
}

/**
 * Records an answered confirmation so the transcript can keep showing what the
 * user picked (spec 13). The anchor is the message count at answer time, which
 * equals the count when the request was asked because the agent pauses on it.
 */
function withAnsweredChoice(
  state: WorkbenchStore,
  key: string,
  sessionId: string,
  choice: Omit<AnsweredChoice, 'anchor' | 'sessionId' | 'id'> & { id: string },
): Partial<WorkbenchStore> {
  const anchor = state.messages[key]?.length ?? 0
  return {
    answeredChoices: {
      ...state.answeredChoices,
      [key]: [...(state.answeredChoices[key] ?? []), { ...choice, sessionId, anchor }],
    },
  }
}

/** Persists the task-map slice; the red-dot key map is flattened back to refs (spec 14). */
function persistTasks(tasks: TasksState): void {
  const bridge = window.handheld
  if (!bridge) return
  const unread = Object.keys(tasks.unread)
    .map((key) => keyParts(key))
    .filter((ref): ref is SessionRef => ref !== null)
  void bridge.settings.update({ tasks: { open: tasks.open, unread } })
}

/**
 * Red-dot bookkeeping (spec 14): leaving a busy task starts watching it; returning
 * clears both the watch and the dot. Keeps record identity when nothing changed.
 */
function switchCurrent(
  state: WorkbenchStore,
  next: SessionRef | null,
): Pick<TasksState, 'watched' | 'unread'> {
  const previous = state.ui.current
  let watched = state.tasks.watched
  let unread = state.tasks.unread
  if (previous && !sameSessionRef(previous, next)) {
    const key = sessionKey(previous)
    if (state.sessions[key]?.runState === 'busy' && !watched[key]) {
      watched = { ...watched, [key]: true }
    }
  }
  if (next) {
    watched = omitKey(watched, sessionKey(next))
    unread = omitKey(unread, sessionKey(next))
  }
  return { watched, unread }
}

function mergeSnapshot(
  state: WorkbenchStore,
  snapshot: EngineSnapshot,
): Pick<WorkbenchStore, 'engines' | 'sessions' | 'pendingPermissions' | 'pendingQuestions'> {
  const prefix = `${snapshot.engineId}:`
  const sessions = Object.fromEntries(
    Object.entries(state.sessions).filter(([key]) => !key.startsWith(prefix)),
  )
  for (const session of snapshot.sessions) sessions[`${prefix}${session.id}`] = session

  const pendingPermissions = Object.fromEntries(
    Object.entries(state.pendingPermissions).filter(([key]) => !key.startsWith(prefix)),
  )
  for (const request of snapshot.pendingPermissions) {
    const key = `${prefix}${request.sessionId}`
    pendingPermissions[key] = [...(pendingPermissions[key] ?? []), request]
  }

  const pendingQuestions = Object.fromEntries(
    Object.entries(state.pendingQuestions).filter(([key]) => !key.startsWith(prefix)),
  )
  for (const request of snapshot.pendingQuestions) {
    const key = `${prefix}${request.sessionId}`
    pendingQuestions[key] = [...(pendingQuestions[key] ?? []), request]
  }

  return {
    engines: {
      ...state.engines,
      [snapshot.engineId]: { status: snapshot.status, capabilities: snapshot.capabilities },
    },
    sessions,
    pendingPermissions,
    pendingQuestions,
  }
}

export const useWorkbenchStore = create<WorkbenchStore>()((set, get) => ({
  ...initialWorkbenchState(),
  recentModels: [],
  initialized: false,

  draftKey() {
    const current = get().ui.current
    return current ? sessionKey(current) : NEW_TASK_KEY
  },

  async initialize() {
    const bridge = window.handheld?.engine
    if (!bridge || get().initialized) return
    set({ initialized: true })
    bridge.onEvent((payload) => get().handleEngineEvent(payload))
    window.handheld.events.on('settings:changed', (next) => {
      set({ defaultModel: next.model.default ?? undefined, recentModels: next.model.recent })
    })
    const [engines, settings] = await Promise.all([bridge.list(), window.handheld.settings.get()])
    set((state) => ({
      defaultModel: settings.model.default ?? undefined,
      recentModels: settings.model.recent,
      tasks: {
        ...state.tasks,
        open: settings.tasks.open,
        unread: Object.fromEntries(
          settings.tasks.unread.map((ref) => [sessionKey(ref), true as const]),
        ),
      },
    }))
    const defaultEngineId = engines[0]?.engineId
    if (!defaultEngineId) return
    set({ defaultEngineId })
    await get().refreshEngine(defaultEngineId)
    get().reconcileTasks()

    const last = settings.ui.lastSession
    if (!last || last.engineId !== defaultEngineId) return
    if (get().sessions[sessionKey(last)]) await get().openSession(last)
  },

  handleEngineEvent(payload) {
    const before = get().tasks
    set((state) => applyEngineEvent(state, payload))
    const after = get().tasks
    if (after !== before) persistTasks(after)
    if (payload.event.type === 'engine.status' && payload.event.status.state === 'ready') {
      void get().refreshEngine(payload.engineId)
    }
  },

  async refreshEngine(engineId) {
    const bridge = window.handheld?.engine
    if (!bridge) return
    const snapshot = await bridge.snapshot(engineId)
    set((state) => ({ ...mergeSnapshot(state, snapshot), engineDefaultModel: snapshot.defaultModel }))
    const current = get().ui.current
    if (current && current.engineId === engineId) await get().loadMessages(current, true)
  },

  /** Drops open/unread refs whose sessions no longer exist and re-sorts by creation time. */
  reconcileTasks() {
    const state = get()
    const { sessions } = state
    const open = state.tasks.open
      .filter((ref) => sessions[sessionKey(ref)])
      .reduce<SessionRef[]>((list, ref) => insertByCreatedAt(list, ref, sessions), [])
    const unread = Object.fromEntries(
      Object.entries(state.tasks.unread).filter(([key]) => sessions[key]),
    )
    const openChanged =
      open.length !== state.tasks.open.length ||
      open.some((ref, index) => !sameSessionRef(ref, state.tasks.open[index] ?? null))
    if (!openChanged && Object.keys(unread).length === Object.keys(state.tasks.unread).length) {
      return
    }
    set({ tasks: { ...state.tasks, open, unread } })
    persistTasks(get().tasks)
  },

  async openSession(ref) {
    const state = get()
    const { watched, unread } = switchCurrent(state, ref)
    const open = insertByCreatedAt(state.tasks.open, ref, state.sessions)
    set({
      tasks: { ...state.tasks, open, watched, unread },
      ui: { ...state.ui, current: ref, openSeq: state.ui.openSeq + 1 },
    })
    if (open !== state.tasks.open || unread !== state.tasks.unread) persistTasks(get().tasks)
    await get().loadMessages(ref)
    void window.handheld.settings.update({ ui: { lastSession: ref } })
  },

  async closeTask(ref) {
    const state = get()
    const key = sessionKey(ref)
    const index = state.tasks.open.findIndex((entry) => sameSessionRef(entry, ref))
    const open = state.tasks.open.filter((entry) => !sameSessionRef(entry, ref))
    const current = sameSessionRef(state.ui.current, ref)
      ? // Switch to the neighbor on the right, else the one on the left (P-16).
        (open[index] ?? open[index - 1] ?? null)
      : state.ui.current
    set({
      tasks: {
        ...state.tasks,
        open,
        unread: omitKey(state.tasks.unread, key),
        watched: omitKey(state.tasks.watched, key),
      },
      ui: { ...state.ui, current },
    })
    persistTasks(get().tasks)
    void window.handheld.settings.update({ ui: { lastSession: current } })
    if (current) await get().loadMessages(current)
  },

  newTask() {
    const state = get()
    const { watched, unread } = switchCurrent(state, null)
    set({ tasks: { ...state.tasks, watched, unread }, ui: { ...state.ui, current: null } })
    void window.handheld.settings.update({ ui: { lastSession: null } })
  },

  async setDefaultModel(model, name) {
    const recent = touchRecentModel(get().recentModels, model, name)
    await window.handheld.settings.update({ model: { default: model, recent } })
  },

  setPendingDirectory(directory) {
    set({ pendingDirectory: directory })
  },

  setPendingEffort(effort) {
    set({ pendingEffort: effort })
  },

  async setSessionEffort(ref, effort) {
    const key = sessionKey(ref)
    const session = get().sessions[key]
    if (session) {
      set((state) => ({ sessions: { ...state.sessions, [key]: { ...session, effort } } }))
    }
    await window.handheld.engine.setSessionEffort(ref, effort)
  },

  setDraft(value) {
    const key = get().draftKey()
    set((state) => ({ ui: { ...state.ui, drafts: { ...state.ui.drafts, [key]: value } } }))
  },

  async sendCurrent() {
    const bridge = window.handheld?.engine
    if (!bridge) return
    const state = get()
    let current = state.ui.current
    const engineId = state.defaultEngineId
    if (!current && !engineId) return
    const draftKey = current ? sessionKey(current) : NEW_TASK_KEY
    const text = (state.ui.drafts[draftKey] ?? '').trim()
    if (!text) return

    const command = parseSlashCommand(text)
    // `/clear` starts a new session in the workbench, which is a UI concern.
    if (command?.name === 'clear') {
      set((next) => ({ ui: { ...next.ui, drafts: { ...next.ui.drafts, [draftKey]: '' } } }))
      get().newTask()
      return
    }

    if (!current && engineId) {
      const model = state.defaultModel
      const opts = {
        ...(model ? { model } : {}),
        ...(state.pendingEffort ? { effort: state.pendingEffort } : {}),
        ...(state.pendingDirectory ? { directory: state.pendingDirectory } : {}),
      }
      let summary: SessionSummary
      try {
        summary = await bridge.createSession(opts, engineId)
      } catch (error) {
        // Nothing to attach the failure to yet, so it surfaces as a toast.
        showToast(i18n.t('toast.messageFailed'), { description: errorMessage(error) })
        return
      }
      const created: SessionRef = { engineId, sessionId: summary.id }
      current = created
      set((next) => ({
        sessions: { ...next.sessions, [sessionKey(created)]: summary },
        // A session's directory and effort are fixed at creation (spec 21).
        pendingDirectory: undefined,
        pendingEffort: undefined,
        ui: { ...next.ui, drafts: { ...next.ui.drafts, [draftKey]: '' } },
      }))
      await get().openSession(created)
    } else if (current) {
      set((next) => ({ ui: { ...next.ui, drafts: { ...next.ui.drafts, [draftKey]: '' } } }))
    }
    if (!current) return

    try {
      if (command && (await isKnownCommand(current.engineId, command.name))) {
        await bridge.runCommand(current, command.name, command.args)
      } else {
        await bridge.prompt(current, { text })
      }
      showToast(i18n.t('toast.sent'))
    } catch (error) {
      // A rejected prompt (missing key, unknown model, ...) has no card and no
      // event, so report it in the transcript and put the draft back to retry.
      const key = sessionKey(current)
      set((next) => ({
        sessionErrors: { ...next.sessionErrors, [key]: errorMessage(error) },
        ui: { ...next.ui, drafts: { ...next.ui.drafts, [key]: text } },
      }))
    }
  },

  async abortCurrent() {
    const current = get().ui.current
    if (current) await window.handheld.engine.abort(current)
  },

  async replyPermission(requestId, reply) {
    const state = get()
    const current = state.ui.current
    if (!current) return
    const key = sessionKey(current)
    const request = (state.pendingPermissions[key] ?? []).find((item) => item.id === requestId)
    if (request) {
      set(
        withAnsweredChoice(state, key, current.sessionId, {
          id: requestId,
          request: { kind: 'permission', title: request.title, detail: request.kind },
          answer: { type: 'permission', reply },
        }),
      )
    }
    await window.handheld.engine.replyPermission(current, requestId, reply)
  },

  async replyQuestion(requestId, answers) {
    const state = get()
    const current = state.ui.current
    if (!current) return
    const key = sessionKey(current)
    const request = (state.pendingQuestions[key] ?? []).find((item) => item.id === requestId)
    if (request) {
      const title = request.questions[0]?.question ?? ''
      set(
        withAnsweredChoice(state, key, current.sessionId, {
          id: requestId,
          request: { kind: 'question', title },
          answer: { type: 'question', answers, ignored: false },
        }),
      )
    }
    await window.handheld.engine.replyQuestion(current, requestId, answers)
  },

  async rejectQuestion(requestId) {
    const state = get()
    const current = state.ui.current
    if (!current) return
    const key = sessionKey(current)
    const request = (state.pendingQuestions[key] ?? []).find((item) => item.id === requestId)
    if (request) {
      const title = request.questions[0]?.question ?? ''
      set(
        withAnsweredChoice(state, key, current.sessionId, {
          id: requestId,
          request: { kind: 'question', title },
          answer: { type: 'question', answers: [], ignored: true },
        }),
      )
    }
    await window.handheld.engine.rejectQuestion(current, requestId)
  },

  async loadMessages(ref, force = false) {
    const key = sessionKey(ref)
    if (!force && get().messagesLoaded[key]) return
    try {
      const messages = await window.handheld.engine.getMessages(ref)
      set((state) => ({
        messages: { ...state.messages, [key]: messages },
        messagesLoaded: { ...state.messagesLoaded, [key]: true },
      }))
    } catch {
      // Leave the transcript unloaded; a later refresh will retry.
    }
  },
}))
