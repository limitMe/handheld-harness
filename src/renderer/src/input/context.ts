import { createContext, useContext } from 'react'
import type { ActionMap } from '@shared/input'
import type { ActionHandlers } from './router'
import type { CapturedControl, ControlChange } from './types'

export interface InputApi {
  /** Registers a context with handlers; call the returned function to pop it. */
  pushContext(id: string, getHandlers: () => ActionHandlers, order?: number): () => void
  /** Resolves with the next control press, for the rebinding UI (spec 15). */
  captureNextControl(): Promise<CapturedControl>
  cancelCapture(): void
  /** Effective bindings, for reverse lookups such as action hints (spec 12). */
  getMap(): ActionMap
  subscribeMap(listener: (map: ActionMap) => void): () => void
  /** Context ids from the top of the stack down, always ending with `global`. */
  subscribeContexts(listener: (ids: string[]) => void): () => void
  /** Raw control edges; used by hints to reset idleness and track holds. */
  subscribeControls(listener: (change: ControlChange) => void): () => void
}

export const InputContext = createContext<InputApi | null>(null)

export function useInputApi(): InputApi {
  const api = useContext(InputContext)
  if (!api) throw new Error('useInputApi must be used within <InputProvider>')
  return api
}
