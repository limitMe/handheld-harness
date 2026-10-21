import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  ChatMessage,
  EngineCapabilities,
  PermissionReply,
  PermissionRequest,
  QuestionRequest,
} from '@shared/engine'
import { CONTEXT_ORDER, onPress, useInputApi, useInputContext } from '../input'
import { useTranslation } from '../i18n'
import { FOCUS_CONTEXT_ID, FOCUS_ORDER, useFocusTree } from '../focus'
import type { AnsweredChoice } from '../state/types'
import { AgentCardView } from './AgentCard'
import { CardViewer } from './CardViewer'
import { ChoiceCardView } from './ChoiceCard'
import { FocusableButton } from './FocusableButton'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'
import { StickyUserMessage } from './StickyUserMessage'
import { findStuckRound, groupRounds, roundCards, type AgentCard } from './rounds'

export interface MessageListProps {
  messages: ChatMessage[]
  permissions: PermissionRequest[]
  questions: QuestionRequest[]
  choices: AnsweredChoice[]
  capabilities?: EngineCapabilities
  busy: boolean
  /** Last run error for this session; shown as a card so failures never look silent. */
  error?: string
  /** When false a higher overlay is on top; pending cards must not consume input. */
  interactive?: boolean
  /** Changes whenever a task is opened; the transcript jumps back to the latest. */
  viewKey: string
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
/** Space kept clear at the bottom for the floating composer (spec 13). */
const COMPOSER_RESERVE_PX = 112

function isCardFocusId(id: string | null): boolean {
  return id !== null && (id.startsWith('permission-') || id.startsWith('question-'))
}

export function MessageList({
  messages,
  permissions,
  questions,
  choices,
  capabilities,
  busy,
  error,
  interactive = true,
  viewKey,
  onReplyPermission,
  onReplyQuestion,
  onRejectQuestion,
}: MessageListProps) {
  const { t } = useTranslation()
  const tree = useFocusTree()
  const input = useInputApi()
  const container = useRef<HTMLDivElement>(null)
  const roundElements = useRef(new Map<string, HTMLDivElement>())
  // `following` means the transcript is pinned to the live tail: every new card,
  // resize, or error re-anchors to the bottom. Only an explicit user scroll up
  // clears it (see the input/wheel handlers below); content reflow must not.
  const [following, setFollowing] = useState(true)
  const followingRef = useRef(following)
  // User gestures, not scroll direction, decide when the live tail re-arms. A
  // near-bottom scroll only resumes following when the user explicitly moved
  // down; programmatic scrolls (focusing a card, layout shifts) must not.
  const userDownRef = useRef(false)
  const pointerScrollRef = useRef(false)
  const interactiveRef = useRef(interactive)
  const lastScrollTop = useRef(0)
  const [scrolledView, setScrolledView] = useState(viewKey)
  // Opening a task always lands on the newest content, even if the previous
  // task was left scrolled up. Adjusting during render (not in an effect) avoids
  // a cascading render.
  if (scrolledView !== viewKey) {
    setScrolledView(viewKey)
    setFollowing(true)
  }
  const [stuckRound, setStuckRound] = useState<string | null>(null)
  const [cardMax, setCardMax] = useState<number>()
  const [viewerId, setViewerId] = useState<string | null>(null)
  const viewerOpenRef = useRef(viewerId !== null)
  const viewerScroll = useRef(0)
  const pendingRestore = useRef<number | null>(null)
  const roundRestore = useRef<string | null>(null)

  const rounds = useMemo(() => groupRounds(messages, choices), [messages, choices])
  const blocksByRound = useMemo(
    () => rounds.map((round) => ({ round, blocks: roundCards(round) })),
    [rounds],
  )

  // Focus order and agent-card lookup, both derived from the card sequence.
  const { orders, agentCards } = useMemo(() => {
    const orders = new Map<string, number>()
    const agentCards = new Map<string, AgentCard>()
    let index = 0
    const next = (): number => FOCUS_ORDER.messages + index++ * FOCUS_ORDER.messageStride
    for (const { round, blocks } of blocksByRound) {
      if (round.user) orders.set(`card-user-${round.user.id}`, next())
      for (const block of blocks) {
        if (block.type === 'agent') {
          orders.set(`card-${block.card.id}`, next())
          agentCards.set(block.card.id, block.card)
        } else {
          orders.set(`choice-${block.choice.id}`, next())
        }
      }
    }
    return { orders, agentCards }
  }, [blocksByRound])

  const lastMessageId = messages[messages.length - 1]?.id
  const viewerCard = viewerId ? agentCards.get(viewerId) : undefined

  const scrollToBottom = useCallback(() => {
    const element = container.current
    if (element) element.scrollTop = element.scrollHeight
  }, [])

  // Agent cards can grow after their first paint (Markdown, syntax highlight),
  // so re-anchor the transcript while the user is following the live tail.
  // Layout effect, not passive: a scroll handler reads the ref synchronously and
  // must not be overwritten by a stale commit before the browser dispatches the
  // next event.
  useLayoutEffect(() => {
    followingRef.current = following
    interactiveRef.current = interactive
    viewerOpenRef.current = viewerId !== null
  })

  const stopFollowing = useCallback(() => {
    const element = container.current
    // Content that fits on screen has nothing to scroll back through, so an up
    // gesture must not surface the "latest" button.
    if (!element || element.scrollHeight - element.clientHeight <= BOTTOM_THRESHOLD) return
    userDownRef.current = false
    if (!followingRef.current) return
    followingRef.current = false
    setFollowing(false)
  }, [])

  const resumeFollowing = useCallback(() => {
    userDownRef.current = false
    followingRef.current = true
    setFollowing(true)
    scrollToBottom()
  }, [scrollToBottom])

  /** Re-arm only after the user scrolled down themselves and reached the tail. */
  const resumeIfAtLiveTail = useCallback(() => {
    const element = container.current
    if (!element || !userDownRef.current) return
    if (element.scrollHeight - element.scrollTop - element.clientHeight > BOTTOM_THRESHOLD) return
    resumeFollowing()
  }, [resumeFollowing])

  const reanchorIfFollowing = useCallback(() => {
    if (followingRef.current) scrollToBottom()
  }, [scrollToBottom])

  // The render-time reset above only covers state. A switched view must also
  // clear the gesture flags and land on the newest content even when the
  // transcript content itself did not change (reopening the same task).
  useLayoutEffect(() => {
    followingRef.current = true
    userDownRef.current = false
    lastScrollTop.current = 0
    scrollToBottom()
  }, [viewKey, scrollToBottom])

  // Only navigation the focus layer itself handles scrolls the transcript; a
  // card, dialog, or viewer above it consumes the action and must not unpin the
  // live tail. Listen to dispatched actions instead of scroll events here: while
  // the agent streams, cards remount and content reflows, which moves scrollTop
  // without any user intent.
  useEffect(() => {
    return input.subscribeDispatch(({ event, contextId }) => {
      if (!interactiveRef.current || viewerOpenRef.current) return
      if (contextId !== FOCUS_CONTEXT_ID || event.phase === 'end') return
      if (event.action === 'nav.up') {
        stopFollowing()
        return
      }
      if (event.action === 'scroll') {
        const value = event.value ?? 0
        if (value < 0) {
          stopFollowing()
          return
        }
        if (value === 0) return
      } else if (event.action !== 'nav.down') {
        return
      }
      userDownRef.current = true
      resumeIfAtLiveTail()
    })
  }, [input, stopFollowing, resumeIfAtLiveTail])

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
    if (following) scrollToBottom()
    updateStuck()
    // `cardMax` is measured after the first paint and re-caps the cards, which
    // changes the content height; re-anchor so the newest content stays visible.
    // `error` appends a card below the rounds, so it must re-anchor too.
  }, [blocksByRound, following, cardMax, error, scrollToBottom, updateStuck, viewKey])

  // One-screen cap for the agent cards: the transcript area above the composer.
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const update = (): void => {
      setCardMax(Math.max(0, element.clientHeight - COMPOSER_RESERVE_PX))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const openViewer = useCallback((card: AgentCard) => {
    viewerScroll.current = container.current?.scrollTop ?? 0
    setViewerId(card.id)
  }, [])

  const closeViewer = useCallback(() => {
    // Restore after the modal scope pops: returning focus to the card runs its
    // own scrollIntoView, which would otherwise override the saved position.
    pendingRestore.current = viewerScroll.current
    setViewerId(null)
  }, [])

  // Passive (not layout) so it runs after the viewer scope's cleanup has popped
  // and the card has run its own scrollIntoView.
  useEffect(() => {
    if (viewerId !== null || pendingRestore.current === null) return
    const top = pendingRestore.current
    pendingRestore.current = null
    const element = container.current
    if (element) element.scrollTop = top
  }, [viewerId])

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
    if (!tree || viewerId || !interactive) return
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
  }, [pendingCardFocusId, tree, viewerId, interactive])

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={container}
        data-testid="message-list"
        data-scroll-region
        onWheel={(event) => {
          if (viewerOpenRef.current) return
          if (event.deltaY < 0) {
            stopFollowing()
          } else if (event.deltaY > 0) {
            userDownRef.current = true
            resumeIfAtLiveTail()
          }
        }}
        onPointerDown={() => {
          pointerScrollRef.current = true
        }}
        onPointerUp={() => {
          pointerScrollRef.current = false
        }}
        onPointerCancel={() => {
          pointerScrollRef.current = false
        }}
        onPointerLeave={() => {
          pointerScrollRef.current = false
        }}
        onScroll={() => {
          const element = container.current
          if (!element) return
          const top = element.scrollTop
          const nearBottom =
            element.scrollHeight - top - element.clientHeight <= BOTTOM_THRESHOLD
          // Pointer drags (scrollbar or touch) are the only scroll events whose
          // direction reveals user intent; keyboard / gamepad navigation and the
          // wheel are handled above. Content growing or being re-capped under a
          // parked viewport may move `top` in either direction without any user
          // action, so it must never arm or cancel the live tail.
          if (pointerScrollRef.current) {
            if (top < lastScrollTop.current) stopFollowing()
            else if (top > lastScrollTop.current) userDownRef.current = true
          }
          if (nearBottom) resumeIfAtLiveTail()
          lastScrollTop.current = top
          updateStuck()
        }}
        className="relative flex h-full flex-col gap-4 overflow-y-auto px-4 py-4 pb-28 scroll-pb-28"
      >
        {messages.length === 0 && !busy && !error ? (
          <p className="m-auto max-w-[36rem] text-center text-text-muted">
            {t('composer.emptyHint')}
          </p>
        ) : null}

        {blocksByRound.map(({ round, blocks }) => (
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
                order={orders.get(`card-user-${round.user.id}`) ?? FOCUS_ORDER.messages}
                collapsed={stuckRound === round.id}
                onRestore={() => {
                  const element = roundElements.current.get(round.id)
                  element?.scrollIntoView({ block: 'start' })
                }}
              />
            ) : null}
            {blocks.map((block) =>
              block.type === 'agent' ? (
                <AgentCardView
                  key={block.card.id}
                  card={block.card}
                  order={orders.get(`card-${block.card.id}`) ?? FOCUS_ORDER.messages}
                  streaming={busy && block.card.messages.some((message) => message.id === lastMessageId)}
                  maxHeight={cardMax}
                  onOpen={openViewer}
                  onResize={reanchorIfFollowing}
                />
              ) : (
                <ChoiceCardView
                  key={block.choice.id}
                  choice={block.choice}
                  order={orders.get(`choice-${block.choice.id}`) ?? FOCUS_ORDER.messages}
                />
              ),
            )}
          </div>
        ))}

        {interactive && firstPermission ? (
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
            interactive={interactive}
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

        {error ? (
          <div
            data-testid="session-error"
            role="alert"
            className="rounded-card border border-danger bg-card px-4 py-3 text-text"
          >
            <p className="font-semibold text-danger">{t('messageList.sessionError')}</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{error}</p>
          </div>
        ) : null}
      </div>

      {!following && !viewerCard ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center">
          <FocusableButton
            focusId="scroll-latest"
            order={FOCUS_ORDER.scrollLatest}
            onActivate={resumeFollowing}
            type="button"
            data-testid="scroll-latest"
            className="pointer-events-auto min-h-11 shadow-card"
            onClick={resumeFollowing}
          >
            {t('messageList.scrollLatest')}
          </FocusableButton>
        </div>
      ) : null}

      {viewerCard ? <CardViewer card={viewerCard} onClose={closeViewer} /> : null}
    </div>
  )
}
