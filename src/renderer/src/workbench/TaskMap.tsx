import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { motion } from 'motion/react'
import type { SessionRef, SessionSummary } from '@shared/engine'
import { ringSlots, sameModelRef } from '@shared/model-recents'
import { FocusContainer, useFocusTree, useFocusable } from '../focus'
import { GamepadGlyph, type GamepadGlyphPhase } from '../glyphs'
import { useTranslation, type Translate } from '../i18n'
import { motionTokens } from '../motion'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { useWorkbenchStore } from '../state/store'
import { sameSessionRef, sessionKey } from '../state/types'
import { ConfirmDialog, cn } from '../ui'
import { HistoryList } from './HistoryList'
import { ModelRing } from './ModelRing'
import {
  buildTaskCards,
  EMPTY_CARD_ID,
  historyEntries,
  initialCardId,
  stepCardId,
  type TaskCard,
} from './taskCards'
import { formatRelativeTime } from './time'

const CARD_WIDTH_PX = 384
const CARD_HEIGHT_PX = 192
const CARD_GAP_PX = 24
const CARD_STRIDE_PX = CARD_WIDTH_PX + CARD_GAP_PX

/** One glyph + label pair in the map's bottom legend. */
function LegendItem({
  control,
  phase,
  label,
}: {
  control: string
  phase?: GamepadGlyphPhase
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <GamepadGlyph control={control} {...(phase ? { phase } : {})} size={22} />
      <span>{label}</span>
    </span>
  )
}

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
  modelName,
  onChoose,
}: {
  card: TaskCard
  order: number
  selected: boolean
  entry?: SessionSummary
  isCurrent: boolean
  unread: boolean
  elementRef?: RefObject<HTMLButtonElement | null>
  /** Current default model, shown as the empty card's model hint. */
  modelName?: string
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
          'relative flex flex-col justify-between rounded-card border-2 bg-card p-4 text-left text-on-card shadow-card transition-[border-color] duration-ui ease-standard',
          borderClass(entry, isCurrent),
        )}
        style={{ width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX }}
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
          {card.kind === 'empty' ? (
            <span className="inline-flex items-center gap-2">
              <GamepadGlyph control="Y" size={24} />
              {t('taskMap.newTask')}
            </span>
          ) : (
            (entry?.title ?? t('taskMap.task'))
          )}
        </span>
        {card.kind === 'empty' ? (
          <span
            data-testid="task-card-empty-hints"
            className="flex flex-col gap-1 text-sm leading-tight text-text-muted"
          >
            <span className="flex items-center gap-2">
              <span className="flex w-14 shrink-0 justify-center">
                <GamepadGlyph control="X" size={18} />
              </span>
              <span>{t('taskMap.hints.openFromHistory')}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="flex w-14 shrink-0 justify-center">
                <GamepadGlyph control="LB" phase="hold" size={18} />
              </span>
              <span className="break-words">
                {t('taskMap.hints.chooseModel', { name: modelName ?? t('models.engineDefault') })}
              </span>
            </span>
          </span>
        ) : (
          <span className="truncate text-code text-text-muted">{entry?.model?.modelId ?? ''}</span>
        )}
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
  onModel,
}: {
  onOpen: () => void
  onExit: () => void
  onNew: () => void
  onHistory: () => void
  onCloseTask: () => void
  onMove: (delta: number) => void
  onModel: () => void
}) {
  useInputContext(
    'taskMap',
    {
      'task.open': onPress(() => onOpen()),
      'map.exit': onPress(() => onExit()),
      'task.close': onPress(() => onCloseTask()),
      'task.new': onPress(() => onNew()),
      'task.history': onPress(() => onHistory()),
      'task.model': onPress(() => onModel()),
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
  const setDefaultModel = useWorkbenchStore((state) => state.setDefaultModel)
  const defaultModel = useWorkbenchStore((state) => state.defaultModel)
  const recentModels = useWorkbenchStore((state) => state.recentModels)

  const [empty, setEmpty] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [modelRingOpen, setModelRingOpen] = useState(false)
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

  // Focus the selected card. The empty card is only focused: activation is a
  // separate concept (spec 11) and the map's own legend describes its actions, so
  // it is never force-activated when it is created or selected.
  useEffect(() => {
    if (!tree || !selectedId) return
    tree.setFocus(selectedId)
    if (selectedCard?.kind === 'empty') return
    tree.activate(selectedId)
  }, [tree, selectedId, selectedCard?.kind])

  const history = useMemo(() => historyEntries(sessions, open), [sessions, open])

  const defaultModelName = defaultModel
    ? (recentModels.find((entry) => sameModelRef(entry.model, defaultModel))?.name ??
      defaultModel.modelId)
    : t('models.engineDefault')

  // The ring lists the recent models; before any model has been chosen it falls
  // back to the current default so there is at least one sector to pick.
  const ring = useMemo(() => {
    if (recentModels.length > 0) return ringSlots(recentModels)
    if (defaultModel) return ringSlots([{ model: defaultModel, slot: 0 }])
    return ringSlots([])
  }, [recentModels, defaultModel])
  const ringInitialSlot = useMemo(() => {
    if (!defaultModel) return null
    const index = ring.findIndex((entry) => entry && sameModelRef(entry.model, defaultModel))
    return index >= 0 ? index : null
  }, [ring, defaultModel])

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
                {...(card.kind === 'empty'
                  ? { elementRef: emptyRef, modelName: defaultModelName }
                  : {})}
                onChoose={choose}
              />
            ))}
          </div>
        </FocusContainer>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6 pb-4 text-code text-text-muted">
        <span className="inline-flex items-center gap-1">
          <GamepadGlyph control="DpadLeft" size={22} />
          <GamepadGlyph control="DpadRight" size={22} />
          <span>{t('taskMap.hints.select')}</span>
        </span>
        <LegendItem control="A" label={t('taskMap.hints.open')} />
        <LegendItem control="Y" label={t('taskMap.hints.new')} />
        <LegendItem control="X" label={t('taskMap.hints.history')} />
        <LegendItem control="B" label={t('taskMap.hints.exit')} />
        <span className="inline-flex items-center gap-1">
          <span className="uppercase tracking-wide">{t('part.hold')}</span>
          <GamepadGlyph control="B" phase="hold" size={22} />
          <span>{t('taskMap.hints.close')}</span>
        </span>
      </div>

      {!historyOpen && !confirmRef && !modelRingOpen ? (
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
          onModel={() => {
            if (selectedCard?.kind === 'empty') setModelRingOpen(true)
          }}
        />
      ) : null}

      {modelRingOpen ? (
        <ModelRing
          slots={ring}
          initialSlot={ringInitialSlot}
          onConfirm={(entry) => {
            setModelRingOpen(false)
            void setDefaultModel(entry.model, entry.name)
          }}
          onCancel={() => setModelRingOpen(false)}
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
