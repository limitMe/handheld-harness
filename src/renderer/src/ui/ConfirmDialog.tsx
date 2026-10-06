import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

const backdropStyles =
  'fixed inset-0 bg-surface/80 transition-opacity duration-ui ease-standard data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'

const popupStyles =
  'fixed top-1/2 left-1/2 flex w-[min(90vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card bg-surface-raised p-6 text-text shadow-card transition-[opacity,transform] duration-ui ease-standard data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0'

const closeStyles =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-surface-raised bg-card px-4 py-2 text-base font-medium text-on-card transition-colors duration-fast ease-standard hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdropStyles} />
        <AlertDialog.Popup className={popupStyles}>
          <AlertDialog.Title className="text-xl font-semibold text-text">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="text-base text-text-muted">
              {description}
            </AlertDialog.Description>
          ) : null}
          <div className="flex justify-end gap-3">
            <AlertDialog.Close className={closeStyles}>{cancelLabel}</AlertDialog.Close>
            <Button
              className={destructive ? 'border-danger text-danger' : undefined}
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
