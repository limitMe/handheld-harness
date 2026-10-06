import { useRef, type ComponentProps } from 'react'
import { useFocusable } from '../focus'
import { Button } from '../ui'

export interface FocusableButtonProps extends ComponentProps<typeof Button> {
  focusId: string
  order?: number
  onActivate?: () => void
  activatable?: boolean
}

/** A Base UI button that is also a focus-tree node (spec 11). */
export function FocusableButton({
  focusId,
  order,
  onActivate,
  activatable,
  ...props
}: FocusableButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const focus = useFocusable({ id: focusId, elementRef: ref, order, activatable, onActivate })
  return <Button {...props} ref={ref} {...focus.props} />
}
