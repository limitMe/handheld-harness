import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChatMessage,
  EngineCapabilities,
  PermissionReply,
  PermissionRequest,
  QuestionRequest,
} from '@shared/engine'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { useTranslation } from '../i18n'
import { FOCUS_ORDER, messageOrder, useFocusTree } from '../focus'
import { FocusableButton } from './FocusableButton'
import { MessageItem } from './MessageItem'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'
import { StickyUserMessage } from './StickyUserMessage'
import { findStuckRound, groupRounds } from './rounds'

export interface MessageListProps {
  messages: ChatMessage[]
  permissions: PermissionRequest[]
  questions: QuestionRequest[]
  capabilities?: EngineCapabilities
  busy: boolean
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

function isCardFocusId(id: string | null): boolean {
  return id !== null && (id.startsWith('permission-') || id.startsWith('question-'))
}

export function MessageList({
  messages,
  permissions,
  questions,
  capabilities,
  busy,
  onReplyPermission,
  onReplyQuestion,
  onRejectQuestion,
}: MessageListProps) {
  const { t } = useTranslation()
  const tree = useFocusTree()
  const container = useRef<HTMLDivElement>(null)
  const roundElements = useRef(new Map<string, HTMLDivElement>())
  const [atBottom, setAtBottom] = useState(true)
  const [stuckRound, setStuckRound] = useState<string | null>(null)
  const roundRestore = useRef<string | null>(null)

  const rounds = useMemo(() => groupRounds(messages), [messages])
  const orderById = useMemo(
    () => new Map(messages.map((message, index) => [message.id, messageOrder(index)])),
    [messages],
  )

  const scrollToBottom = useCallback(() => {
    const element = container.current
    if (element) element.scrollTop = element.scrollHeight
  }, [])

  const updateStuck = useCallback(() => {
    const element = container.current
    if (!element) return
    const geometry = [...roundElements.current.entries()].map(([id, node]) => ({
      id,
      top: node.offsetTop,
      height: node.offsetHeight,
    }))
    const next = findStuckRound(geometry, element.scrollTop)
    setStuckRound((previous) => (previous === next ? previous : next))
  }, [])

  useEffect(() => {
    if (atBottom) scrollToBottom()
    updateStuck()
  }, [rounds, atBottom, scrollToBottom, updateStuck])

  // A new request takes focus and activates the card so its action hints show
  // (spec 13, P-02). When the queue drains, focus returns where it was.
  const firstPermission = permissions[0]
  const firstQuestion = questions[0]
  const pendingCardFocusId = firstPermission
    ? `permission-${firstPermission.id}`
    : firstQuestion
      ? `question-${firstQuestion.id}`
      : null
  const pendingRef = useRef(false)

  useEffect(() => {
    if (!tree) return
    if (pendingCardFocusId) {
      if (!pendingRef.current) {
        pendingRef.current = true
        const current = tree.getFocusedId()
        if (current && !isCardFocusId(current)) roundRestore.current = current
      }
      if (tree.getActivatedId() !== pendingCardFocusId) {
        tree.setFocus(pendingCardFocusId)
        tree.activate(pendingCardFocusId)
      }
    } else if (pendingRef.current) {
      pendingRef.current = false
      const restore = roundRestore.current
      roundRestore.current = null
      if (restore && tree.getElement(restore)) tree.setFocus(restore)
    }
  }, [pendingCardFocusId, tree])

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
          updateStuck()
        }}
        className="relative flex h-full flex-col gap-4 overflow-y-auto px-4 py-4 pb-28 scroll-pb-28"
      >
        {messages.length === 0 && !busy ? (
          <p className="m-auto max-w-[36rem] text-center text-text-muted">
            {t('composer.emptyHint')}
          </p>
        ) : null}

        {rounds.map((round) => (
          <div
            key={round.id}
            ref={(element) => {
              if (element) roundElements.current.set(round.id, element)
              else roundElements.current.delete(round.id)
            }}
            data-testid={`round-${round.id}`}
            className="flex flex-col gap-4"
          >
            {round.user ? (
              <StickyUserMessage
                message={round.user}
                baseOrder={orderById.get(round.user.id) ?? FOCUS_ORDER.messages}
                collapsed={stuckRound === round.id}
                onRestore={() => {
                  const element = roundElements.current.get(round.id)
                  element?.scrollIntoView({ block: 'start' })
                }}
              />
            ) : null}
            {round.replies.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                baseOrder={orderById.get(message.id) ?? FOCUS_ORDER.messages}
                streaming={busy && message.id === messages[messages.length - 1]?.id}
              />
            ))}
          </div>
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
            {t('messageList.agentWorking')}
          </p>
        ) : null}
      </div>

      {!atBottom ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center">
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
            {t('messageList.scrollLatest')}
          </FocusableButton>
        </div>
      ) : null}
    </div>
  )
}
