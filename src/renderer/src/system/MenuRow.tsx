import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useFocusable, type FocusDirection, type NavigateResult } from '../focus'
import { cn } from '../ui'

/** Default Back handler for the settings column: return to the category list. */
const MenuCancelContext = createContext<(() => void) | null>(null)

export function MenuCancelProvider({
  onCancel,
  children,
}: {
  onCancel: () => void
  children: ReactNode
}) {
  return <MenuCancelContext.Provider value={onCancel}>{children}</MenuCancelContext.Provider>
}

/** The panel's Back handler, for custom focusable rows (spec 15). */
export function useMenuCancel(): (() => void) | undefined {
  return useContext(MenuCancelContext) ?? undefined
}

export interface MenuRowProps {
  id: string
  order?: number
  selected?: boolean
  /** When true the row enters an internal mode on A (spec 11). */
  activatable?: boolean
  onActivate?: () => void
  onDeactivate?: () => void
  onCancel?: () => void
  onNavigate?: (direction: FocusDirection) => NavigateResult | void
  onFocus?: () => void
  /** Mouse / touch activation; gamepad and keyboard go through the focus tree. */
  onClick?: () => void
  className?: string
  testId?: string
  children: ReactNode
}

// No resting border: adjacent rows would double theirs up and read as a heavy
// line. The focused row is singled out by the focus ring (spec 18), and the
// selected row by its background.
const baseStyles =
  'flex min-h-11 w-full items-center justify-between gap-4 rounded-md bg-surface px-3 py-2 text-left text-base text-text transition-colors duration-fast ease-standard'

/**
 * One focusable settings row. It uses a div rather than a button so Enter does
 * not fire the native click on top of the focus-tree activation (spec 15).
 */
export function MenuRow({
  id,
  order,
  selected,
  activatable,
  onActivate,
  onDeactivate,
  onCancel,
  onNavigate,
  onFocus,
  onClick,
  className,
  testId,
  children,
}: MenuRowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const cancelFallback = useContext(MenuCancelContext)
  const handleCancel = onCancel ?? (cancelFallback ? () => cancelFallback() : undefined)
  const focus = useFocusable({
    id,
    elementRef: ref,
    ...(order !== undefined ? { order } : {}),
    ...(activatable !== undefined ? { activatable } : {}),
    ...(onActivate ? { onActivate } : {}),
    ...(onDeactivate ? { onDeactivate } : {}),
    ...(handleCancel ? { onCancel: handleCancel } : {}),
    ...(onNavigate ? { onNavigate } : {}),
    ...(onFocus ? { onFocus } : {}),
  })

  return (
    <div
      ref={ref}
      {...focus.props}
      role="button"
      data-testid={testId}
      data-selected={selected ? '' : undefined}
      onClick={onClick}
      className={cn(baseStyles, selected ? 'bg-card text-on-card' : '', className)}
    >
      {children}
    </div>
  )
}

export function MenuGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-sm uppercase tracking-wide text-text-muted">{children}</p>
  )
}
