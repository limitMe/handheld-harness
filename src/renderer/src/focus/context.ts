import { createContext, useContext } from 'react'
import type { FocusTree } from './tree'

/** Null outside a `<FocusProvider>`; hooks degrade to no-ops so isolated UI renders work. */
export const FocusTreeContext = createContext<FocusTree | null>(null)

export const FocusContainerContext = createContext<string | null>(null)

export function useFocusTree(): FocusTree | null {
  return useContext(FocusTreeContext)
}

export function useParentContainer(): string | null {
  return useContext(FocusContainerContext)
}
