import { create } from 'zustand'
import type {
  CommandInfo,
  EngineEventPayload,
  EngineSnapshot,
  PermissionReply,
  SessionRef,
} from '@shared/engine'
import { parseSlashCommand } from '../workbench/commands'
import { applyEngineEvent } from './applyEngineEvent'
import { initialWorkbenchState, sessionKey, type WorkbenchState } from './types'

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
  openSession(ref: SessionRef): Promise<void>
  newTask(): void
  draftKey(): string
  setDraft(value: string): void
  sendCurrent(): Promise<void>
  abortCurrent(): Promise<void>
  replyPermission(requestId: string, reply: PermissionReply): Promise<void>
  replyQuestion(requestId: string, answers: string[][]): Promise<void>
  rejectQuestion(requestId: string): Promise<void>
  deleteCurrentSession(): Promise<void>
  loadMessages(ref: SessionRef, force?: boolean): Promise<void>
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
    const defaultEngineId = engines[0]?.engineId
    if (!defaultEngineId) return
    set({ defaultEngineId })
    await get().refreshEngine(defaultEngineId)

    const last = settings.ui.lastSession
    if (!last || last.engineId !== defaultEngineId) return
    if (get().sessions[sessionKey(last)]) await get().openSession(last)
  },

  handleEngineEvent(payload) {
    set((state) => applyEngineEvent(state, payload))
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

  async openSession(ref) {
    set((state) => ({ ui: { ...state.ui, current: ref } }))
    await get().loadMessages(ref)
    void window.handheld.settings.update({ ui: { lastSession: ref } })
  },

  newTask() {
    set((state) => ({ ui: { ...state.ui, current: null } }))
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
      current = { engineId, sessionId: summary.id }
      set((next) => ({ ui: { ...next.ui, current, drafts: { ...next.ui.drafts, [draftKey]: '' } } }))
      void window.handheld.settings.update({ ui: { lastSession: current } })
      await get().loadMessages(current)
    } else if (current) {
      set((next) => ({ ui: { ...next.ui, drafts: { ...next.ui.drafts, [draftKey]: '' } } }))
    }
    if (!current) return

    if (command && (await isKnownCommand(current.engineId, command.name))) {
      await bridge.runCommand(current, command.name, command.args)
      return
    }
    await bridge.prompt(current, { text })
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

  async deleteCurrentSession() {
    const current = get().ui.current
    if (!current) return
    const key = sessionKey(current)
    await window.handheld.engine.deleteSession(current)
    set((state) => {
      const messages = { ...state.messages }
      delete messages[key]
      const messagesLoaded = { ...state.messagesLoaded }
      delete messagesLoaded[key]
      return {
        messages,
        messagesLoaded,
        ui: { ...state.ui, current: null },
      }
    })
    void window.handheld.settings.update({ ui: { lastSession: null } })
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
