import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useRef, type RefObject } from 'react'
import { FocusContainer, useDialogNavigation, useFocusable } from '../focus'
import { useTranslation } from '../i18n'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  /** Which button the focus tree starts on; dangerous actions default to Cancel (spec 12). */
  initialFocus?: 'cancel' | 'confirm'
  onConfirm: () => void
}

const backdropStyles =
  'fixed inset-0 z-50 bg-surface/80 transition-opacity duration-ui ease-standard data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'

const popupStyles =
  'fixed top-1/2 left-1/2 z-50 flex w-[min(90vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card bg-surface-raised p-6 text-text shadow-card transition-[opacity,transform] duration-ui ease-standard data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0'

const closeStyles =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-surface-raised bg-card px-4 py-2 text-base font-medium text-on-card transition-colors duration-fast ease-standard hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none'

/** Mounted inside the portal, so the focus nodes exist only while the dialog is open. */
function ConfirmButtons({
  cancelRef,
  confirmRef,
  confirmLabel,
  cancelLabel,
  destructive,
  initialFocus,
  onConfirm,
  onOpenChange,
}: Pick<
  ConfirmDialogProps,
  'confirmLabel' | 'cancelLabel' | 'destructive' | 'initialFocus' | 'onConfirm' | 'onOpenChange'
> & {
  cancelRef: RefObject<HTMLButtonElement | null>
  confirmRef: RefObject<HTMLButtonElement | null>
}) {
  useDialogNavigation()
  const confirmFirst = initialFocus === 'confirm'
  const cancel = useFocusable({
    id: 'confirm-dialog-cancel',
    elementRef: cancelRef,
    // Sibling order decides which button the scope focuses first: dangerous
    // actions start on Cancel (spec 12).
    order: confirmFirst ? 1 : 0,
    onActivate: () => onOpenChange(false),
    // B / Escape cancels from either button (spec 12).
    onCancel: () => onOpenChange(false),
  })
  const confirm = useFocusable({
    id: 'confirm-dialog-confirm',
    elementRef: confirmRef,
    order: confirmFirst ? 0 : 1,
    onActivate: () => {
      onConfirm()
      onOpenChange(false)
    },
    onCancel: () => onOpenChange(false),
  })

  return (
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
  )
}

/** Wrapped in a scope so navigation is trapped inside the dialog (spec 12). */
function ConfirmActions(props: Parameters<typeof ConfirmButtons>[0]) {
  return (
    <FocusContainer id="confirm-dialog" flow="row" scope>
      <ConfirmButtons {...props} />
    </FocusContainer>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  initialFocus = 'cancel',
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel')

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdropStyles} />
        {/* The focus tree owns the initial focus so `initialFocus` can pick the
            default button (spec 12); letting Base UI focus the first tabbable
            would always land on Cancel. */}
        <AlertDialog.Popup initialFocus={false} finalFocus={false} className={popupStyles}>
          <AlertDialog.Title className="text-xl font-semibold text-text">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="text-base text-text-muted">
              {description}
            </AlertDialog.Description>
          ) : null}
          <ConfirmActions
            cancelRef={cancelRef}
            confirmRef={confirmRef}
            confirmLabel={confirmLabel}
            cancelLabel={resolvedCancelLabel}
            destructive={destructive}
            initialFocus={initialFocus}
            onConfirm={onConfirm}
            onOpenChange={onOpenChange}
          />
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
