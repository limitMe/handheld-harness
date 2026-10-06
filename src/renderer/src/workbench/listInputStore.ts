import { create } from 'zustand'

const STORAGE_KEY = 'handheld.listInput.recent'
const MAX_RECENT = 20

function load(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string[]> = {}
    for (const [engineId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        out[engineId] = value.filter((item): item is string => typeof item === 'string')
      }
    }
    return out
  } catch {
    return {}
  }
}

export interface ListInputState {
  /** Most recently used command names per engine (spec 12: sorted per engine). */
  recent: Record<string, string[]>
  record(engineId: string, name: string): void
}

export const useListInputStore = create<ListInputState>()((set) => ({
  recent: load(),

  record(engineId, name) {
    set((state) => {
      const existing = state.recent[engineId] ?? []
      const next = {
        ...state.recent,
        [engineId]: [name, ...existing.filter((entry) => entry !== name)].slice(0, MAX_RECENT),
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Persistence is best-effort; ordering still works for this session.
      }
      return { recent: next }
    })
  },
}))
