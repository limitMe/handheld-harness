import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { motion } from 'motion/react'
import type { SessionRef, SessionSummary } from '@shared/engine'
import { FocusContainer, useFocusTree, useFocusable } from '../focus'
import { useTranslation, type Translate } from '../i18n'
import { motionTokens } from '../motion'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { useWorkbenchStore } from '../state/store'
import { sameSessionRef, sessionKey } from '../state/types'
import { ConfirmDialog, cn } from '../ui'
import { HistoryList } from './HistoryList'
import {
  buildTaskCards,
  EMPTY_CARD_ID,
  historyEntries,
  initialCardId,
  stepCardId,
  type TaskCard,
} from './taskCards'
import { formatRelativeTime } from './time'

const CARD_WIDTH_PX = 208
const CARD_GAP_PX = 24
const CARD_STRIDE_PX = CARD_WIDTH_PX + CARD_GAP_PX

export interface TaskMapProps {
  open: boolean
  onClose: () => void
}

function borderClass(entry: SessionSummary | undefined, isCurrent: boolean): string {
  if (isCurrent) return 'border-accent'
  if (entry?.runState === 'busy') return 'border-warning'
  if (entry?.runState === 'error') return 'border-danger'
  return 'border-surface-raised'
}

function statusLabel(entry: SessionSummary | undefined, isCurrent: boolean, t: Translate): string {
  if (isCurrent) return t('taskMap.current')
  if (!entry) return t('taskMap.task')
  if (entry.runState === 'busy') return t('taskMap.working')
  if (entry.runState === 'error') return t('taskMap.error')
  return formatRelativeTime(entry.updatedAt, t)
}

function TaskCardView({
  card,
  order,
  selected,
  entry,
  isCurrent,
  unread,
  elementRef,
  onChoose,
}: {
  card: TaskCard
  order: number
  selected: boolean
  entry?: SessionSummary
  isCurrent: boolean
  unread: boolean
  elementRef?: RefObject<HTMLButtonElement | null>
  onChoose: (card: TaskCard) => void
}) {
  const { t } = useTranslation()
  const innerRef = useRef<HTMLButtonElement>(null)
  const ref = elementRef ?? innerRef
  const focus = useFocusable({
    id: card.id,
    elementRef: ref,
    order,
    activatable: true,
    // Cards are opened by the map's own bindings / clicks; activation only marks
    // the selected card so action hints describe the map (spec 14).
    onActivate: () => undefined,
    onNavigate: () => 'handled',
  })
  const tokens = motionTokens()

  return (
    // Staggered entrance (spec 18): cards fade/slide in ~30 ms apart. The
    // interval scales with the fast duration token rather than a fixed number.
    <motion.div
      className="shrink-0"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.ui, ease: tokens.ease, delay: order * (tokens.fast / 4) }}
    >
      <motion.button
        ref={ref}
        {...focus.props}
        type="button"
        onClick={() => onChoose(card)}
        data-testid={card.kind === 'empty' ? 'task-card-empty' : 'task-card'}
        data-card-key={card.id}
        data-task-card=""
        data-selected={selected ? '' : undefined}
        className={cn(
          'relative flex h-48 flex-col justify-between rounded-card border-2 bg-card p-4 text-left text-on-card shadow-card transition-[border-color] duration-ui ease-standard',
          borderClass(entry, isCurrent),
        )}
        style={{ width: CARD_WIDTH_PX }}
        animate={{ scale: selected ? 1.1 : 0.9, opacity: selected ? 1 : 0.6 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      >
        {unread ? (
          <span
            data-testid="task-unread"
            className="absolute top-2 right-2 h-3 w-3 rounded-full bg-danger"
          />
        ) : null}
        <span className="text-sm uppercase tracking-wide text-text-muted">
          {card.kind === 'empty' ? t('taskMap.newBadge') : statusLabel(entry, isCurrent, t)}
        </span>
        <span className="line-clamp-3 text-xl font-semibold">
          {card.kind === 'empty' ? t('taskMap.newTask') : (entry?.title ?? t('taskMap.task'))}
        </span>
        <span className="truncate text-code text-text-muted">
          {card.kind === 'empty' ? t('taskMap.historyBadge') : (entry?.model?.modelId ?? '')}
        </span>
      </motion.button>
    </motion.div>
  )
}

/** Map bindings live in a child so they can unmount while an overlay owns input. */
function TaskMapBindings({
  onOpen,
  onExit,
  onNew,
  onHistory,
  onCloseTask,
  onMove,
}: {
  onOpen: () => void
  onExit: () => void
  onNew: () => void
  onHistory: () => void
  onCloseTask: () => void
  onMove: (delta: number) => void
}) {
  useInputContext(
    'taskMap',
    {
      'task.open': onPress(() => onOpen()),
      'map.exit': onPress(() => onExit()),
      'task.close': onPress(() => onCloseTask()),
      'task.new': onPress(() => onNew()),
      'task.history': onPress(() => onHistory()),
      'nav.left': onPress(() => onMove(-1)),
      'nav.right': onPress(() => onMove(1)),
    },
    CONTEXT_ORDER.overlay,
  )
  return null
}

function TaskMapBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const tree = useFocusTree()
  const open = useWorkbenchStore((state) => state.tasks.open)
  const unread = useWorkbenchStore((state) => state.tasks.unread)
  const current = useWorkbenchStore((state) => state.ui.current)
  const sessions = useWorkbenchStore((state) => state.sessions)
  const openSession = useWorkbenchStore((state) => state.openSession)
  const closeTask = useWorkbenchStore((state) => state.closeTask)
  const newTask = useWorkbenchStore((state) => state.newTask)

  const [empty, setEmpty] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmRef, setConfirmRef] = useState<SessionRef | null>(null)
  const [rawSelectedId, setSelectedId] = useState(() =>
    initialCardId(buildTaskCards(open, open.length === 0), current),
  )
  const emptyRef = useRef<HTMLButtonElement>(null)

  const showEmpty = empty || open.length === 0
  const cards = useMemo(() => buildTaskCards(open, showEmpty), [open, showEmpty])
  // Fall back to the first card if the stored selection no longer exists, without
  // an effect: the invalid id is simply not used.
  const selectedId = cards.some((card) => card.id === rawSelectedId)
    ? rawSelectedId
    : (cards[0]?.id ?? '')
  const selectedIndex = Math.max(
    0,
    cards.findIndex((card) => card.id === selectedId),
  )
  const selectedCard = cards.find((card) => card.id === selectedId) ?? cards[0]

  // Focus and activate the selected card so action hints describe the map.
  useEffect(() => {
    if (!tree || !selectedId) return
    tree.setFocus(selectedId)
    tree.activate(selectedId)
  }, [tree, selectedId])

  const history = useMemo(() => historyEntries(sessions, open), [sessions, open])

  const choose = (card: TaskCard): void => {
    if (card.kind === 'empty') {
      newTask()
      onClose()
      return
    }
    void openSession(card.ref)
    onClose()
  }

  const chooseHistory = (ref: SessionRef): void => {
    setHistoryOpen(false)
    void openSession(ref)
    onClose()
  }

  const confirmClose = async (): Promise<void> => {
    const ref = confirmRef
    if (!ref) return
    setConfirmRef(null)
    const before = useWorkbenchStore.getState()
    const wasCurrent = sameSessionRef(before.ui.current, ref)
    const index = before.tasks.open.findIndex((entry) => sameSessionRef(entry, ref))
    await closeTask(ref)
    const next = useWorkbenchStore.getState()
    if (wasCurrent && next.ui.current) {
      setSelectedId(sessionKey(next.ui.current))
      return
    }
    // Closing a background card keeps the selection next to where it was.
    const neighbor = next.tasks.open[index] ?? next.tasks.open[index - 1]
    setSelectedId(neighbor ? sessionKey(neighbor) : EMPTY_CARD_ID)
  }

  const offset = selectedIndex * CARD_STRIDE_PX + CARD_WIDTH_PX / 2

  return (
    <div data-testid="task-map" className="absolute inset-0 z-40 flex flex-col bg-surface/85">
      <div className="relative flex-1 overflow-hidden">
        <FocusContainer id="task-map" flow="row" scope>
          <div
            className="absolute top-1/2 left-1/2 flex h-56 items-center transition-transform duration-scene ease-standard"
            style={{ gap: CARD_GAP_PX, transform: `translate(${-offset}px, -50%)` }}
          >
            {cards.map((card, index) => (
              <TaskCardView
                key={card.id}
                card={card}
                order={index}
                selected={card.id === selectedId}
                entry={card.kind === 'task' ? sessions[card.id] : undefined}
                isCurrent={card.kind === 'task' && sameSessionRef(card.ref, current)}
                unread={card.kind === 'task' && Boolean(unread[card.id])}
                {...(card.kind === 'empty' ? { elementRef: emptyRef } : {})}
                onChoose={choose}
              />
            ))}
          </div>
        </FocusContainer>
      </div>
      <p className="shrink-0 px-6 pb-4 text-center text-code text-text-muted">
        {t('taskMap.keysHint')}
      </p>

      {!historyOpen && !confirmRef ? (
        <TaskMapBindings
          onOpen={() => selectedCard && choose(selectedCard)}
          onExit={onClose}
          onNew={() => {
            setEmpty(true)
            setSelectedId(EMPTY_CARD_ID)
          }}
          onHistory={() => {
            if (selectedCard?.kind === 'empty') setHistoryOpen(true)
          }}
          onCloseTask={() => {
            if (selectedCard?.kind === 'task') setConfirmRef(selectedCard.ref)
          }}
          onMove={(delta) => setSelectedId(stepCardId(cards, selectedId, delta))}
        />
      ) : null}

      {historyOpen ? (
        <HistoryList
          anchor={emptyRef}
          entries={history}
          onChoose={chooseHistory}
          onCancel={() => setHistoryOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={confirmRef !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmRef(null)
        }}
        title={t('taskMap.closeTitle')}
        description={t('taskMap.closeDescription')}
        confirmLabel={t('common.close')}
        initialFocus="confirm"
        onConfirm={() => void confirmClose()}
      />
    </div>
  )
}

/** Mounted only while open, so selection and the empty card reset on every open. */
export function TaskMap({ open, onClose }: TaskMapProps) {
  if (!open) return null
  return <TaskMapBody onClose={onClose} />
}
