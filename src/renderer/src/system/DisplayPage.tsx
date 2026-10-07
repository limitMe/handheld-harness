import type { Settings, SettingsPatch } from '@shared/ipc'
import { MenuGroupLabel, MenuRow } from './MenuRow'
import { Switch } from '../ui'

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Display & hints (spec 15): font zoom and the action-hint settings (P-09). */
export function DisplayPage({ settings, update }: DisplayPageProps) {
  const zoom = settings.ui.zoom
  const delayMs = settings.hints.delayMs

  const setZoom = (next: number): void => {
    const factor = Math.round(clamp(next, ZOOM_MIN, ZOOM_MAX) * 100) / 100
    window.handheld?.window.setZoom(factor).catch(() => undefined)
  }

  return (
    <div data-testid="display-page">
      <MenuGroupLabel>Display</MenuGroupLabel>
      <MenuRow
        id="system-menu.first"
        order={0}
        activatable
        autoActivate
        testId="display-zoom"
        onActivate={() => undefined}
        onNavigate={(direction) => {
          if (direction === 'left' || direction === 'right') {
            setZoom(zoom + (direction === 'right' ? ZOOM_STEP : -ZOOM_STEP))
            return 'handled'
          }
          return 'pass'
        }}
      >
        <span>Text size</span>
        <span className="text-code text-text-muted">{Math.round(zoom * 100)}%</span>
      </MenuRow>

      <MenuGroupLabel>Action hints</MenuGroupLabel>
      <MenuRow
        id="system-menu.display.hints"
        order={1}
        testId="display-hints-enabled"
        onActivate={() => void update({ hints: { enabled: !settings.hints.enabled } })}
        onClick={() => void update({ hints: { enabled: !settings.hints.enabled } })}
      >
        <span>Show action hints</span>
        <Switch checked={settings.hints.enabled} />
      </MenuRow>
      <MenuRow
        id="system-menu.display.delay"
        order={2}
        activatable
        autoActivate
        testId="display-hints-delay"
        onActivate={() => undefined}
        onNavigate={(direction) => {
          if (direction === 'left' || direction === 'right') {
            const next = clamp(
              delayMs + (direction === 'right' ? DELAY_STEP : -DELAY_STEP),
              DELAY_MIN,
              DELAY_MAX,
            )
            void update({ hints: { delayMs: next } })
            return 'handled'
          }
          return 'pass'
        }}
      >
        <span>Wait before showing</span>
        <span className="text-code text-text-muted">{(delayMs / 1000).toFixed(1)}s</span>
      </MenuRow>

      <p className="px-3 pt-4 text-code text-text-muted">
        Reduced motion and power saving arrive with spec 18.
      </p>
    </div>
  )
}
