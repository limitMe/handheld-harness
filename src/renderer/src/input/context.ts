import { createContext, useContext } from 'react'
import type { ActionHandlers } from './router'
import type { CapturedControl } from './types'

export interface InputApi {
  /** Registers a context with handlers; call the returned function to pop it. */
  pushContext(id: string, getHandlers: () => ActionHandlers, order?: number): () => void
  /** Resolves with the next control press, for the rebinding UI (spec 15). */
  captureNextControl(): Promise<CapturedControl>
  cancelCapture(): void
}

export const InputContext = createContext<InputApi | null>(null)

export function useInputApi(): InputApi {
  const api = useContext(InputContext)
  if (!api) throw new Error('useInputApi must be used within <InputProvider>')
  return api
}
