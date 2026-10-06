import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useRef } from 'react'
import { FocusContainer, useFocusable } from '../focus'
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

/** Mounted inside the portal, so the focus nodes exist only while the dialog is open. */
function ConfirmActions({
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onOpenChange,
}: Pick<
  ConfirmDialogProps,
  'confirmLabel' | 'cancelLabel' | 'destructive' | 'onConfirm' | 'onOpenChange'
>) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancel = useFocusable({
    id: 'confirm-dialog-cancel',
    elementRef: cancelRef,
    onActivate: () => onOpenChange(false),
  })
  const confirm = useFocusable({
    id: 'confirm-dialog-confirm',
    elementRef: confirmRef,
    onActivate: () => {
      onConfirm()
      onOpenChange(false)
    },
  })

  return (
    <FocusContainer id="confirm-dialog" flow="row" scope>
      <div className="flex justify-end gap-3">
        <AlertDialog.Close ref={cancelRef} {...cancel.props} className={closeStyles}>
          {cancelLabel ?? 'Cancel'}
        </AlertDialog.Close>
        <Button
          ref={confirmRef}
          {...confirm.props}
          className={destructive ? 'border-danger text-danger' : undefined}
          onClick={() => {
            onConfirm()
            onOpenChange(false)
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </FocusContainer>
  )
}

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
        <AlertDialog.Popup finalFocus={false} className={popupStyles}>
          <AlertDialog.Title className="text-xl font-semibold text-text">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="text-base text-text-muted">
              {description}
            </AlertDialog.Description>
          ) : null}
          <ConfirmActions
            confirmLabel={confirmLabel}
            cancelLabel={cancelLabel}
            destructive={destructive}
            onConfirm={onConfirm}
            onOpenChange={onOpenChange}
          />
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
