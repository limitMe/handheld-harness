import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useRef } from 'react'
import type { UpdateStatus } from '@shared/ipc'
import { FocusContainer, useDialogNavigation, useFocusable } from '../focus'
import { useTranslation } from '../i18n'
import { cn } from './cn'

export interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: UpdateStatus
  onDownload: () => void
  onInstall: () => void
}

const backdropStyles =
  'fixed inset-0 z-50 bg-surface/80 transition-opacity duration-ui ease-standard data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'

const popupStyles =
  'fixed top-1/2 left-1/2 z-50 flex w-[min(90vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card bg-surface-raised p-6 text-text shadow-card transition-[opacity,transform] duration-ui ease-standard data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0'

const closeStyles =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-surface-raised bg-card px-4 py-2 text-base font-medium text-on-card transition-colors duration-fast ease-standard hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none'

interface DialogAction {
  id: string
  label: string
  onSelect: () => void
}

function UpdateActionButton({
  action,
  order,
  onOpenChange,
}: {
  action: DialogAction
  order: number
  onOpenChange: (open: boolean) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const focus = useFocusable({
    id: `update-dialog-${action.id}`,
    elementRef: ref,
    order,
    onActivate: action.onSelect,
    onCancel: () => onOpenChange(false),
  })
  return (
    <button
      ref={ref}
      {...focus.props}
      type="button"
      data-testid={`update-${action.id}`}
      className={cn(closeStyles, order === 0 && 'border-focus-ring')}
      onClick={action.onSelect}
    >
      {action.label}
    </button>
  )
}

/** Mounted inside the portal, so the focus nodes exist only while open. */
function UpdateActions({
  actions,
  onOpenChange,
}: {
  actions: DialogAction[]
  onOpenChange: (open: boolean) => void
}) {
  useDialogNavigation()
  return (
    <FocusContainer id="update-dialog" flow="row" scope>
      <div className="flex justify-end gap-3">
        {actions.map((action, index) => (
          <UpdateActionButton
            key={action.id}
            action={action}
            order={index}
            onOpenChange={onOpenChange}
          />
        ))}
      </div>
    </FocusContainer>
  )
}

/** Auto-update dialog (spec 19): release notes, progress and restart prompt. */
export function UpdateDialog({
  open,
  onOpenChange,
  status,
  onDownload,
  onInstall,
}: UpdateDialogProps) {
  const { t } = useTranslation()

  const description = ((): string => {
    switch (status.state) {
      case 'checking':
        return t('update.checking')
      case 'up-to-date':
        return t('update.upToDate', { version: status.version })
      case 'downloading':
        return t('update.downloading', { percent: status.percent })
      case 'downloaded':
        return t('update.downloadedBody', { version: status.version })
      case 'error':
        return status.message
      case 'unavailable':
        return t('update.unavailable')
      default:
        return t('update.checking')
    }
  })()

  const title =
    status.state === 'available'
      ? t('update.availableTitle', { version: status.version })
      : status.state === 'downloaded'
        ? t('update.downloadedTitle')
        : status.state === 'error'
          ? t('update.errorTitle')
          : t('update.title')

  const actions: DialogAction[] =
    status.state === 'available'
      ? [
          { id: 'update', label: t('update.update'), onSelect: onDownload },
          { id: 'cancel', label: t('update.cancel'), onSelect: () => onOpenChange(false) },
        ]
      : status.state === 'downloaded'
        ? [
            {
              id: 'restart',
              label: t('update.restart'),
              onSelect: () => {
                onInstall()
                onOpenChange(false)
              },
            },
            { id: 'later', label: t('update.later'), onSelect: () => onOpenChange(false) },
          ]
        : [{ id: 'close', label: t('update.close'), onSelect: () => onOpenChange(false) }]

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdropStyles} />
        <AlertDialog.Popup initialFocus={false} finalFocus={false} className={popupStyles}>
          <AlertDialog.Title className="text-xl font-semibold text-text">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-base text-text-muted">
            {description}
          </AlertDialog.Description>
          {status.state === 'available' ? (
            <div
              data-testid="update-notes"
              className="max-h-[40vh] overflow-y-auto rounded-md border border-surface-raised bg-card p-3"
            >
              <p className="text-base whitespace-pre-wrap text-on-card">
                {status.notes?.trim() ? status.notes : t('update.noNotes')}
              </p>
            </div>
          ) : null}
          <UpdateActions actions={actions} onOpenChange={onOpenChange} />
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
