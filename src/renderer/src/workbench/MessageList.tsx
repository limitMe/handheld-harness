import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ChatMessage,
  EngineCapabilities,
  PermissionReply,
  PermissionRequest,
  QuestionRequest,
} from '@shared/engine'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { FOCUS_ORDER, messageOrder } from '../focus'
import { FocusableButton } from './FocusableButton'
import { MessageItem } from './MessageItem'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'

export interface MessageListProps {
  messages: ChatMessage[]
  permissions: PermissionRequest[]
  questions: QuestionRequest[]
  capabilities?: EngineCapabilities
  busy: boolean
  inputEmpty: boolean
  onReplyPermission: (requestId: string, reply: PermissionReply) => void
  onReplyQuestion: (requestId: string, answers: string[][]) => void
  onRejectQuestion: (requestId: string) => void
}

/** Gamepad A/X/B respond to the first pending request (spec 10 permission context). */
function PermissionInputContext({
  permissionAlways,
  onReply,
}: {
  permissionAlways: boolean
  onReply: (reply: PermissionReply) => void
}) {
  useInputContext(
    'currentWork.permission',
    {
      'permission.once': onPress(() => onReply('once')),
      'permission.reject': onPress(() => onReply('reject')),
      ...(permissionAlways ? { 'permission.always': onPress(() => onReply('always')) } : {}),
    },
    CONTEXT_ORDER.overlay,
  )
  return null
}

const BOTTOM_THRESHOLD = 48

export function MessageList({
  messages,
  permissions,
  questions,
  capabilities,
  busy,
  inputEmpty,
  onReplyPermission,
  onReplyQuestion,
  onRejectQuestion,
}: MessageListProps) {
  const container = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const firstPermission = permissions[0]
  const firstPermissionId = firstPermission?.id

  const scrollToBottom = useCallback(() => {
    const element = container.current
    if (element) element.scrollTop = element.scrollHeight
  }, [])

  useEffect(() => {
    if (atBottom) scrollToBottom()
  }, [messages, permissions, questions, atBottom, scrollToBottom])

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={container}
        data-testid="message-list"
        data-scroll-region
        onScroll={() => {
          const element = container.current
          if (!element) return
          setAtBottom(
            element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_THRESHOLD,
          )
        }}
        className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !busy ? (
          <p className="m-auto max-w-[36rem] text-center text-text-muted">
            Describe what you want the agent to do. Enter sends, Shift+Enter adds a line.
          </p>
        ) : null}

        {messages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            baseOrder={messageOrder(index)}
            streaming={
              busy && index === messages.length - 1 && message.role === 'assistant'
            }
          />
        ))}

        {firstPermission ? (
          <PermissionInputContext
            permissionAlways={capabilities?.permissionAlways ?? false}
            onReply={(reply) => onReplyPermission(firstPermission.id, reply)}
          />
        ) : null}

        {permissions.map((request) => (
          <PermissionCard
            key={request.id}
            request={request}
            permissionAlways={capabilities?.permissionAlways ?? false}
            autoFocus={inputEmpty && firstPermissionId === request.id}
            onReply={(reply) => onReplyPermission(request.id, reply)}
          />
        ))}

        {questions.map((request) => (
          <QuestionCard
            key={request.id}
            request={request}
            onReply={(answers) => onReplyQuestion(request.id, answers)}
            onReject={() => onRejectQuestion(request.id)}
          />
        ))}

        {busy ? (
          <p
            data-testid="busy-indicator"
            className="animate-pulse text-base text-text-muted"
            aria-live="polite"
          >
            Agent is working…
          </p>
        ) : null}
      </div>

      {!atBottom ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <FocusableButton
            focusId="scroll-latest"
            order={FOCUS_ORDER.scrollLatest}
            onActivate={() => {
              setAtBottom(true)
              scrollToBottom()
            }}
            type="button"
            data-testid="scroll-latest"
            className="pointer-events-auto min-h-11"
            onClick={() => {
              setAtBottom(true)
              scrollToBottom()
            }}
          >
            ↓ Latest
          </FocusableButton>
        </div>
      ) : null}
    </div>
  )
}
