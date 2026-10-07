import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useRef } from 'react'
import { FocusContainer, useFocusable } from '../focus'
import { cn } from './cn'

export interface ChoiceOption {
  id: string
  label: string
  description?: string
  destructive?: boolean
}

export interface ChoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  options: ChoiceOption[]
  /** Option that receives the initial focus; defaults to the first. */
  initialId?: string
  onChoose: (id: string) => void
}

const backdropStyles =
  'fixed inset-0 z-50 bg-surface/80 transition-opacity duration-ui ease-standard data-[starting-style]:opacity-0 data-[ending-style]:opacity-0'

const popupStyles =
  'fixed top-1/2 left-1/2 z-50 flex w-[min(90vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card bg-surface-raised p-6 text-text shadow-card transition-[opacity,transform] duration-ui ease-standard data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0'

const optionStyles =
  'flex min-h-11 w-full flex-col items-start gap-1 rounded-md border border-surface-raised bg-card px-4 py-2 text-left text-base text-on-card transition-colors duration-fast ease-standard hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none'

/** Mounted inside the portal so the focus nodes exist only while open. */
function ChoiceButtons({
  options,
  initialId,
  onChoose,
  onOpenChange,
}: Pick<ChoiceDialogProps, 'options' | 'initialId' | 'onChoose' | 'onOpenChange'>) {
  const initialIndex = Math.max(
    0,
    options.findIndex((option) => option.id === initialId),
  )

  return (
    <div className="flex flex-col gap-2">
      {options.map((option, index) => (
        <ChoiceButton
          key={option.id}
          option={option}
          order={index === initialIndex ? -1 : index}
          onChoose={() => {
            onChoose(option.id)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      ))}
    </div>
  )
}

function ChoiceButton({
  option,
  order,
  onChoose,
  onCancel,
}: {
  option: ChoiceOption
  order: number
  onChoose: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const focus = useFocusable({
    id: `choice-dialog-${option.id}`,
    elementRef: ref,
    order,
    onActivate: onChoose,
    onCancel,
  })
  return (
    <button
      ref={ref}
      {...focus.props}
      type="button"
      data-testid={`choice-${option.id}`}
      className={cn(optionStyles, option.destructive && 'border-danger text-danger')}
      onClick={onChoose}
    >
      <span className="font-medium">{option.label}</span>
      {option.description ? (
        <span className="text-code text-text-muted">{option.description}</span>
      ) : null}
    </button>
  )
}

/** Modal choice list (spec 15): used for key-binding conflict resolution. */
export function ChoiceDialog({
  open,
  onOpenChange,
  title,
  description,
  options,
  initialId,
  onChoose,
}: ChoiceDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdropStyles} />
        <AlertDialog.Popup initialFocus={false} finalFocus={false} className={popupStyles}>
          <AlertDialog.Title className="text-xl font-semibold text-text">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="text-base text-text-muted">
              {description}
            </AlertDialog.Description>
          ) : null}
          <FocusContainer id="choice-dialog" flow="column" scope>
            <ChoiceButtons
              options={options}
              initialId={initialId}
              onChoose={onChoose}
              onOpenChange={onOpenChange}
            />
          </FocusContainer>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
