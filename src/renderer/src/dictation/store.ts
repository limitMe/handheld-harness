import { create } from 'zustand'

export type DictationStatus = 'idle' | 'starting' | 'listening'

export interface DictationState {
  status: DictationStatus
  /** 0..1 input level while dictating; drives the status-bar meter. */
  level: number
  error: string | null
  setStatus(status: DictationStatus): void
  setLevel(level: number): void
  setError(error: string | null): void
}

/** Shared dictation status for the status bar and the input layer (spec 12/16). */
export const useDictationStore = create<DictationState>()((set) => ({
  status: 'idle',
  level: 0,
  error: null,
  setStatus: (status) => set({ status }),
  setLevel: (level) => set({ level }),
  setError: (error) => set({ error }),
}))
