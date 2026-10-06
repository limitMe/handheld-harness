import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface OverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  className?: string
  children: ReactNode
}

const backdropStyles =
  'fixed inset-0 bg-surface/80 transition-opacity duration-ui ease-standard data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'

const popupStyles =
  'fixed top-1/2 left-1/2 flex max-h-[85vh] w-[min(90vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-auto rounded-card bg-surface-raised p-6 text-text shadow-card transition-[opacity,transform] duration-ui ease-standard data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0'

const closeStyles =
  'self-end rounded-md border border-surface bg-card px-4 py-2 text-base text-on-card transition-colors duration-fast ease-standard hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none'

export function Overlay({
  open,
  onOpenChange,
  title,
  description,
  className,
  children,
}: OverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropStyles} />
        <Dialog.Popup className={cn(popupStyles, className)}>
          <Dialog.Title className="text-xl font-semibold text-text">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="text-base text-text-muted">{description}</Dialog.Description>
          ) : null}
          {children}
          <Dialog.Close className={closeStyles}>Close</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
