import { useRef } from 'react'
import type { PermissionReply, PermissionRequest } from '@shared/engine'
import { useFocusable, FOCUS_ORDER } from '../focus'
import { Button } from '../ui'

export interface PermissionCardProps {
  request: PermissionRequest
  permissionAlways: boolean
  onReply: (reply: PermissionReply) => void
}

/**
 * Permission prompt. The list auto-focuses and activates it so the action hints
 * (A allow once / X always / B reject) show beside it (spec 13, P-02); handlers
 * live in the `currentWork.permission` input context.
 */
export function PermissionCard({ request, permissionAlways, onReply }: PermissionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const focus = useFocusable({
    id: `permission-${request.id}`,
    elementRef: cardRef,
    order: FOCUS_ORDER.cards,
    activatable: true,
  })

  const actions: Array<{ label: string; reply: PermissionReply; testId: string }> = [
    { label: 'Allow once', reply: 'once', testId: 'permission-once' },
    ...(permissionAlways
      ? [{ label: 'Always allow', reply: 'always' as PermissionReply, testId: 'permission-always' }]
      : []),
    { label: 'Reject', reply: 'reject', testId: 'permission-reject' },
  ]

  return (
    <div
      ref={cardRef}
      {...focus.props}
      data-testid="permission-card"
      onKeyDown={(event) => {
        const index = Number(event.key) - 1
        const action = actions[index]
        if (action) {
          event.preventDefault()
          onReply(action.reply)
        }
      }}
      className="flex flex-col gap-3 rounded-card border border-warning bg-card p-4 text-on-card"
    >
      <div className="flex items-center gap-2">
        <span className="text-warning">⚠</span>
        <span className="font-semibold">Permission requested</span>
      </div>
      <p className="text-base">{request.title}</p>
      <p className="text-code text-text-muted">
        {request.kind}
        {request.patterns.length ? ` · ${request.patterns.join(', ')}` : ''}
      </p>
      <div className="flex flex-wrap gap-3">
        {actions.map((action, index) => (
          <Button
            key={action.reply}
            data-testid={action.testId}
            className="min-h-11"
            onClick={() => onReply(action.reply)}
          >
            <span className="text-text-muted">{index + 1}</span>
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
