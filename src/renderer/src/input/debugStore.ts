import { create } from 'zustand'
import type { ActionId } from '@shared/actions'
import type { ActionPhase, InputSource } from './types'

export interface DebugAction {
  seq: number
  action: ActionId
  phase: ActionPhase
  source: InputSource
  control: string
  handled: boolean
  contextId?: string
  at: number
}

export interface InputDebugState {
  contexts: string[]
  actions: DebugAction[]
  setContexts(contexts: string[]): void
  record(entry: Omit<DebugAction, 'seq'>): void
  clear(): void
}

const MAX_ACTIONS = 50

/** Shared with the gamepad probe page (spec 10 acceptance: "current triggered actions"). */
export const useInputDebugStore = create<InputDebugState>()((set) => ({
  contexts: [],
  actions: [],

  setContexts(contexts) {
    set({ contexts })
  },

  record(entry) {
    set((state) => ({
      actions: [{ ...entry, seq: (state.actions[0]?.seq ?? 0) + 1 }, ...state.actions].slice(
        0,
        MAX_ACTIONS,
      ),
    }))
  },

  clear() {
    set({ actions: [] })
  },
}))
