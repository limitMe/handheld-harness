import { create } from 'zustand'
import type {
  CommandInfo,
  EngineEventPayload,
  EngineSnapshot,
  PermissionReply,
  SessionRef,
} from '@shared/engine'
import { showToast } from '../ui/Toast'
import { parseSlashCommand } from '../workbench/commands'
import { applyEngineEvent } from './applyEngineEvent'
import {
  initialWorkbenchState,
  insertByCreatedAt,
  keyParts,
  omitKey,
  sameSessionRef,
  sessionKey,
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

export interface WorkbenchStore extends WorkbenchState {
  defaultEngineId?: string
  initialized: boolean
  initialize(): Promise<void>
  handleEngineEvent(payload: EngineEventPayload): void
  refreshEngine(engineId: string): Promise<void>
  reconcileTasks(): void
  openSession(ref: SessionRef): Promise<void>
  closeTask(ref: SessionRef): Promise<void>
  newTask(): void
  draftKey(): string
  setDraft(value: string): void
  sendCurrent(): Promise<void>
  abortCurrent(): Promise<void>
  replyPermission(requestId: string, reply: PermissionReply): Promise<void>
  replyQuestion(requestId: string, answers: string[][]): Promise<void>
  rejectQuestion(requestId: string): Promise<void>
  loadMessages(ref: SessionRef, force?: boolean): Promise<void>
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
    const [engines, settings] = await Promise.all([bridge.list(), window.handheld.settings.get()])
    set((state) => ({
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
    set((state) => mergeSnapshot(state, snapshot))
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
    set({ tasks: { ...state.tasks, open, watched, unread }, ui: { ...state.ui, current: ref } })
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
      const summary = await bridge.createSession(undefined, engineId)
      const created: SessionRef = { engineId, sessionId: summary.id }
      current = created
      set((next) => ({
        sessions: { ...next.sessions, [sessionKey(created)]: summary },
        ui: { ...next.ui, drafts: { ...next.ui.drafts, [draftKey]: '' } },
      }))
      await get().openSession(created)
    } else if (current) {
      set((next) => ({ ui: { ...next.ui, drafts: { ...next.ui.drafts, [draftKey]: '' } } }))
    }
    if (!current) return

    if (command && (await isKnownCommand(current.engineId, command.name))) {
      await bridge.runCommand(current, command.name, command.args)
      showToast('Sent')
      return
    }
    await bridge.prompt(current, { text })
    showToast('Sent')
  },

  async abortCurrent() {
    const current = get().ui.current
    if (current) await window.handheld.engine.abort(current)
  },

  async replyPermission(requestId, reply) {
    const current = get().ui.current
    if (current) await window.handheld.engine.replyPermission(current, requestId, reply)
  },

  async replyQuestion(requestId, answers) {
    const current = get().ui.current
    if (current) await window.handheld.engine.replyQuestion(current, requestId, answers)
  },

  async rejectQuestion(requestId) {
    const current = get().ui.current
    if (current) await window.handheld.engine.rejectQuestion(current, requestId)
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
