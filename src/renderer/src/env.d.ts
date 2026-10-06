import type { HandheldApi } from '@shared/ipc'

declare global {
  interface Window {
    handheld: HandheldApi
  }
}

export {}
