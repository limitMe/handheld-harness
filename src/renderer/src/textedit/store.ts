import { create } from 'zustand'

/**
 * Coordinates the full-screen text editor across the composer, the overlay and
 * the status bar (spec 17). The editor owns its own sentence state while open;
 * this store only carries the open flag, the composer snapshot and a revision
 * the composer uses to restore its activation when the editor closes.
 */
export interface TextEditState {
  open: boolean
  /** Composer text captured when the editor opened. */
  source: string
  /** Composer caret at open, used to focus the sentence being edited. */
  caret: number
  /** Bumped on every close so the composer can re-activate itself. */
  revision: number
  openEditor(source: string, caret: number): void
  close(): void
}

export const useTextEditStore = create<TextEditState>()((set) => ({
  open: false,
  source: '',
  caret: 0,
  revision: 0,

  openEditor(source, caret) {
    set({ open: true, source, caret })
  },

  close() {
    set((state) => ({ open: false, revision: state.revision + 1 }))
  },
}))
