import type { Settings, SettingsPatch } from '@shared/ipc'
import { Slider, Switch } from '../ui'
import { MenuGroupLabel, MenuRow } from './MenuRow'

export interface DisplayPageProps {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}

const ZOOM_MIN = 0.8
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1
const DELAY_MIN = 0
const DELAY_MAX = 10_000
const DELAY_STEP = 250
const SCROLL_MIN = 0.25
const SCROLL_MAX = 2
const SCROLL_STEP = 0.25

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function fraction(value: number, min: number, max: number): number {
  return clamp((value - min) / (max - min), 0, 1)
}

function fromFraction(value: number, min: number, max: number): number {
  return min + clamp(value, 0, 1) * (max - min)
}

function round(value: number, step: number): number {
  return Math.round(value / step) * step
}

interface ValueRowProps {
  id: string
  order: number
  testId: string
  label: string
  display: string
  value: number
  min: number
  max: number
  step: number
  /** Left/right on the gamepad or keyboard. */
  onAdjust: (direction: -1 | 1) => void
  /** Dragging the track; receives a 0..1 fraction. */
  onSlide: (value: number) => void
}

/** A settings row whose value is edited with a draggable track (spec 15). */
function ValueRow({
  id,
  order,
  testId,
  label,
  display,
  value,
  min,
  max,
  step,
  onAdjust,
  onSlide,
}: ValueRowProps) {
  return (
    <MenuRow
      id={id}
      order={order}
      activatable
      testId={testId}
      onActivate={() => undefined}
      onNavigate={(direction) => {
        if (direction !== 'left' && direction !== 'right') return 'pass'
        onAdjust(direction === 'right' ? 1 : -1)
        return 'handled'
      }}
    >
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <span>{label}</span>
          <span className="text-code text-text-muted">{display}</span>
        </div>
        <Slider
          value={fraction(value, min, max)}
          onChange={(next) => onSlide(round(fromFraction(next, min, max), step))}
        />
      </div>
    </MenuRow>
  )
}

/** Display & hints (spec 15): font zoom, scroll speed and the action-hint settings (P-09). */
export function DisplayPage({ settings, update }: DisplayPageProps) {
  const zoom = settings.ui.zoom
  const scrollSpeed = settings.ui.scrollSpeed
  const delayMs = settings.hints.delayMs

  const setZoom = (next: number): void => {
    const factor = Math.round(clamp(next, ZOOM_MIN, ZOOM_MAX) * 100) / 100
    window.handheld?.window.setZoom(factor).catch(() => undefined)
  }

  return (
    <div data-testid="display-page">
      <MenuGroupLabel>Display</MenuGroupLabel>
      <ValueRow
        id="system-menu.first"
        order={0}
        testId="display-zoom"
        label="Text size"
        display={`${Math.round(zoom * 100)}%`}
        value={zoom}
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={ZOOM_STEP}
        onAdjust={(direction) => setZoom(zoom + direction * ZOOM_STEP)}
        onSlide={setZoom}
      />

      <MenuGroupLabel>Scrolling</MenuGroupLabel>
      <ValueRow
        id="system-menu.display.scroll"
        order={1}
        testId="display-scroll-speed"
        label="Stick scroll speed"
        display={`${Math.round(scrollSpeed * 100)}%`}
        value={scrollSpeed}
        min={SCROLL_MIN}
        max={SCROLL_MAX}
        step={SCROLL_STEP}
        onAdjust={(direction) =>
          void update({
            ui: {
              scrollSpeed: clamp(
                round(scrollSpeed + direction * SCROLL_STEP, 0.05),
                SCROLL_MIN,
                SCROLL_MAX,
              ),
            },
          })
        }
        onSlide={(next) => void update({ ui: { scrollSpeed: next } })}
      />

      <MenuGroupLabel>Action hints</MenuGroupLabel>
      <MenuRow
        id="system-menu.display.hints"
        order={2}
        testId="display-hints-enabled"
        onActivate={() => void update({ hints: { enabled: !settings.hints.enabled } })}
        onClick={() => void update({ hints: { enabled: !settings.hints.enabled } })}
      >
        <span>Show action hints</span>
        <Switch checked={settings.hints.enabled} />
      </MenuRow>
      <ValueRow
        id="system-menu.display.delay"
        order={3}
        testId="display-hints-delay"
        label="Wait before showing"
        display={`${(delayMs / 1000).toFixed(1)}s`}
        value={delayMs}
        min={DELAY_MIN}
        max={DELAY_MAX}
        step={DELAY_STEP}
        onAdjust={(direction) =>
          void update({
            hints: { delayMs: clamp(delayMs + direction * DELAY_STEP, DELAY_MIN, DELAY_MAX) },
          })
        }
        onSlide={(next) => void update({ hints: { delayMs: next } })}
      />

      <p className="px-3 pt-4 text-code text-text-muted">
        Reduced motion and power saving arrive with spec 18.
      </p>
    </div>
  )
}
