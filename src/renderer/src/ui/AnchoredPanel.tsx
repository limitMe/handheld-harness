import { Popover } from '@base-ui/react/popover'
import type { ReactNode, RefObject } from 'react'
import { cn } from './cn'

export interface AnchoredPanelProps {
  open: boolean
  /** Element (or ref to one) the panel floats next to; nothing renders until known. */
  anchor: Element | RefObject<Element | null> | null
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  className?: string
  children: ReactNode
}

// The popup receives DOM focus, so suppress the browser's default focus ring;
// navigation is shown by the highlighted row instead (spec 18).
const popupStyles =
  'rounded-card border border-surface-raised bg-surface-raised text-on-card shadow-card outline-none transition-[opacity,transform] duration-fast ease-standard data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0'

/**
 * Floating panel positioned against an anchor through Base UI's Floating UI
 * layer (spec 12). Used by action hints and list input.
 */
export function AnchoredPanel({
  open,
  anchor,
  side = 'top',
  align = 'center',
  sideOffset = 8,
  className,
  children,
}: AnchoredPanelProps) {
  if (!anchor) return null
  return (
    <Popover.Root open={open}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="z-50"
        >
          <Popover.Popup className={cn(popupStyles, className)}>{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
