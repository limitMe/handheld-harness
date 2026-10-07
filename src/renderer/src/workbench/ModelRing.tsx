import { useCallback, useEffect, useRef, useState } from 'react'
import { RING_SLOTS, type RecentModel } from '@shared/model-recents'
import { GamepadGlyph } from '../glyphs'
import { useTranslation } from '../i18n'
import { CONTEXT_ORDER, useInputApi, useInputContext, type ActionHandlers } from '../input'
import { cn } from '../ui'
import { ringPoint, ringSlotFromStick, sectorPath } from './ringGeometry'

const VIEW = 400
const CX = VIEW / 2
const CY = VIEW / 2
const OUTER = 188
const INNER = 84
/** Gap between neighboring sectors, in degrees at each edge. */
const GAP_DEG = 4
const STEP = 360 / RING_SLOTS
const HALF = STEP / 2 - GAP_DEG
/** Base font size in viewBox units; names are shrunk/compressed to fit the sector. */
const FONT_SIZE = 12
/** Widest a name may get, in viewBox units (the thinnest sector width). */
const MAX_TEXT_WIDTH = 96
const MAX_NAME_CHARS = 16

export interface ModelRingProps {
  /** Ring contents by slot (0 = top, clockwise); `null` for an empty slot. */
  slots: Array<RecentModel | null>
  /** Slot to highlight on open; falls back to the first occupied slot. */
  initialSlot: number | null
  onConfirm: (entry: RecentModel) => void
  onCancel: () => void
}

function firstOccupied(slots: Array<RecentModel | null>, preferred: number | null): number | null {
  if (preferred !== null && slots[preferred]) return preferred
  const index = slots.findIndex((entry) => entry !== null)
  return index >= 0 ? index : null
}

function truncateName(value: string): string {
  return value.length > MAX_NAME_CHARS ? `${value.slice(0, MAX_NAME_CHARS - 1)}…` : value
}

/** Compresses a name to the sector width; null lets SVG keep the natural width. */
function textLengthFor(value: string): number | undefined {
  const estimated = value.length * FONT_SIZE * 0.62
  return estimated > MAX_TEXT_WIDTH ? MAX_TEXT_WIDTH : undefined
}

/**
 * Actions the ring swallows so they cannot reach the task map (or the screen
 * beneath it) while the ring is open. The ring reads the stick and buttons
 * directly, so it does not need to bind anything else.
 */
const RING_CONSUMED: ActionHandlers = {
  'nav.up': () => undefined,
  'nav.down': () => undefined,
  'nav.left': () => undefined,
  'nav.right': () => undefined,
  'nav.activate': () => undefined,
  'nav.deactivate': () => undefined,
  scroll: () => undefined,
  'agent.abort': () => undefined,
  'task.open': () => undefined,
  'task.new': () => undefined,
  'task.history': () => undefined,
  'task.close': () => undefined,
  'task.model': () => undefined,
  'map.exit': () => undefined,
}

/** A sector's fill: the pointed one is highlighted, grey when it holds no model. */
export function ringSectorFill(isPointed: boolean, occupied: boolean): string {
  if (isPointed) return occupied ? 'fill-accent/35' : 'fill-text-muted/25'
  return occupied ? 'fill-surface-raised' : 'fill-surface-raised/50'
}

/**
 * The model ring (spec 14): long-pressing LB on the empty task card opens six
 * annular sectors over the map. The stick direction points at a sector; releasing
 * LB adopts the highlighted model, `B` / `Escape` cancels.
 */
export function ModelRing({ slots, initialSlot, onConfirm, onCancel }: ModelRingProps) {
  const { t } = useTranslation()
  const api = useInputApi()
  const [selected, setSelected] = useState(() => firstOccupied(slots, initialSlot))

  const selectedRef = useRef(selected)
  const slotsRef = useRef(slots)
  const confirmRef = useRef(onConfirm)
  const cancelRef = useRef(onCancel)
  const axes = useRef({ lx: 0, ly: 0, rx: 0, ry: 0 })

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  useEffect(() => {
    slotsRef.current = slots
    confirmRef.current = onConfirm
    cancelRef.current = onCancel
  })

  const select = useCallback((slot: number | null) => {
    // Any sector can take the cursor, occupied or not: pointing at an empty one
    // still lights it up (grey) so the wheel visibly responds.
    if (slot === null || slot === selectedRef.current) return
    selectedRef.current = slot
    setSelected(slot)
  }, [])

  const confirm = useCallback(() => {
    const slot = selectedRef.current
    const entry = slot === null ? null : slotsRef.current[slot]
    if (entry) confirmRef.current(entry)
    else cancelRef.current()
  }, [])

  // Shadow the map's bindings while the ring is open; it owns the input itself.
  useInputContext('taskMap.modelPicker', RING_CONSUMED, CONTEXT_ORDER.modal)

  useEffect(() => {
    return api.subscribeControls((change) => {
      if (change.source === 'gamepad') {
        if (change.control === 'LB') {
          if (!change.pressed) confirm()
          return
        }
        if (change.control === 'B' && change.pressed) {
          cancelRef.current()
          return
        }
        const values = axes.current
        if (change.control === 'LStickX') values.lx = change.value
        else if (change.control === 'LStickY') values.ly = change.value
        else if (change.control === 'RStickX') values.rx = change.value
        else if (change.control === 'RStickY') values.ry = change.value
        else return
        // The two axes of a stick report separately, so a release zeroes one axis
        // a frame before the other. Recomputing then would read a half-updated
        // pair and snap the ring to a cardinal sector (usually the top); only a
        // still-deflected stick moves the cursor.
        if (!change.pressed) return
        const useLeft =
          Math.hypot(values.lx, values.ly) >= Math.hypot(values.rx, values.ry)
        select(ringSlotFromStick(useLeft ? values.lx : values.rx, useLeft ? values.ly : values.ry))
        return
      }
      if (change.source === 'keyboard' && change.control === 'Escape' && change.pressed) {
        cancelRef.current()
      }
    })
  }, [api, select, confirm])

  return (
    <div
      data-testid="model-ring"
      className="absolute inset-0 z-50 flex items-center justify-center bg-surface/95"
    >
      <div className="relative flex items-center justify-center">
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          role="img"
          aria-label={t('actions.task.model')}
          className="h-[min(84vmin,640px)] w-[min(84vmin,640px)]"
        >
          {/* Solid centre so the map/card behind does not show through the hole. */}
          <circle cx={CX} cy={CY} r={INNER - 2} className="fill-surface" />
          {slots.map((entry, slot) => {
            const center = slot * STEP
            const isPointed = slot === selected
            const occupied = entry !== null
            const label = entry ? (entry.name ?? entry.model.modelId) : ''
            const text = ringPoint(CX, CY, (INNER + OUTER) / 2, center)
            const textLength = textLengthFor(truncateName(label))
            return (
              <g
                key={slot}
                data-testid={`model-ring-slot-${slot}`}
                data-slot={slot}
                data-selected={isPointed ? '' : undefined}
                data-occupied={occupied ? '' : undefined}
                data-model={entry ? `${entry.model.providerId}/${entry.model.modelId}` : undefined}
              >
                <path
                  d={sectorPath(CX, CY, INNER, OUTER, center - HALF, center + HALF)}
                  className={cn(
                    'transition-colors duration-fast ease-standard',
                    ringSectorFill(isPointed, occupied),
                  )}
                />
                {occupied ? (
                  <text
                    x={text.x}
                    y={text.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={FONT_SIZE}
                    fontWeight={600}
                    {...(textLength !== undefined
                      ? { textLength, lengthAdjust: 'spacingAndGlyphs' as const }
                      : {})}
                    className="select-none fill-text"
                  >
                    {truncateName(label)}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>

        {/* The stick glyph in the hole tells the user how the ring is driven. */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-text-muted">
          <GamepadGlyph control="RS" size={56} />
        </div>
      </div>
    </div>
  )
}
