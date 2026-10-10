import { useEffect, type RefObject } from 'react'

/**
 * Keeps the highlighted row of a scrollable list visible. The command picker and
 * the history picker own their highlight instead of registering with the focus
 * tree, so unlike focused cards they must scroll their own container themselves
 * (spec 12/14).
 */
export function useScrollHighlighted(
  containerRef: RefObject<HTMLElement | null>,
  highlighted: number,
): void {
  useEffect(() => {
    const active = containerRef.current?.querySelector<HTMLElement>('[data-highlighted]')
    active?.scrollIntoView?.({ block: 'nearest' })
  }, [containerRef, highlighted])
}
