import { useEffect, useRef, useState } from 'react'
import { useDictationStore } from '../dictation'
import { useEngineStatus } from '../engine/useEngineStatus'
import { useFocusable, FOCUS_ORDER } from '../focus'
import { useTranslation } from '../i18n'
import { Button } from '../ui'
import { NetworkIcon, useNetworkStatus } from './network'

interface BatteryState {
  level: number
  charging: boolean
}

interface BatteryManagerLike extends BatteryState {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManagerLike>
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** Re-aligns to the start of every minute so the clock never drifts. */
function useClock(): string {
  const [time, setTime] = useState(() => formatTime(new Date()))
  useEffect(() => {
    let timer = 0
    const schedule = (): void => {
      const delay = 60_000 - (Date.now() % 60_000)
      timer = window.setTimeout(() => {
        setTime(formatTime(new Date()))
        schedule()
      }, delay)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [])
  return time
}

function useBattery(): BatteryState | null {
  const [battery, setBattery] = useState<BatteryState | null>(null)
  useEffect(() => {
    const getBattery = (navigator as NavigatorWithBattery).getBattery
    if (!getBattery) return
    let cancelled = false
    let manager: BatteryManagerLike | null = null
    const update = (): void => {
      if (manager) setBattery({ level: manager.level, charging: manager.charging })
    }
    getBattery
      .call(navigator)
      .then((resolved) => {
        if (cancelled) return
        manager = resolved
        update()
        manager.addEventListener('levelchange', update)
        manager.addEventListener('chargingchange', update)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      if (manager) {
        manager.removeEventListener('levelchange', update)
        manager.removeEventListener('chargingchange', update)
      }
    }
  }, [])
  return battery
}

function useProfile(): string | undefined {
  const [profile, setProfile] = useState<string | undefined>()
  useEffect(() => {
    const app = window.handheld?.app
    if (!app) return
    let cancelled = false
    app
      .getInfo()
      .then((info) => {
        if (!cancelled) setProfile(info.profile)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return profile
}

/** `stable` and `dev` are labeled so users can tell the two dogfooding instances apart. */
export function profileBadge(profile: string | undefined): string | null {
  if (profile === 'stable') return 'STABLE'
  if (profile === 'dev') return 'DEV'
  return null
}

export interface StatusBarProps {
  /** Screens show their name or the session title; the text editor passes none (spec 12). */
  title?: string
  /** Touch / keyboard entry point for the task map (spec 14). */
  onOpenTasks?: () => void
}

/** The ready state is the normal case, so its dot would only add noise (spec 12). */
export function engineDotClass(state: string | undefined): string | null {
  if (!state || state === 'ready') return null
  if (state === 'down') return 'bg-danger'
  return 'bg-warning'
}

export default function StatusBar({ title, onOpenTasks }: StatusBarProps) {
  const { t } = useTranslation()
  const time = useClock()
  const network = useNetworkStatus()
  const battery = useBattery()
  const engineStatus = useEngineStatus()
  const badge = profileBadge(useProfile())
  const dictationStatus = useDictationStore((state) => state.status)
  const dictationLevel = useDictationStore((state) => state.level)
  const tasksRef = useRef<HTMLButtonElement>(null)
  const tasksFocus = useFocusable({
    id: 'open-tasks',
    elementRef: tasksRef,
    order: FOCUS_ORDER.screen,
    onActivate: () => onOpenTasks?.(),
  })

  const dotClass = engineDotClass(engineStatus?.state)

  const networkLabel =
    network.kind === 'offline'
      ? t('status.network.offline')
      : network.kind === 'cellular'
        ? t('status.network.cellular', { level: network.level })
        : network.kind === 'ethernet'
          ? t('status.network.ethernet')
          : t('status.network.wifi', { level: network.level })

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-surface-raised bg-surface px-4">
      <div className="flex flex-1 items-center justify-start gap-3">
        {onOpenTasks ? (
          <Button
            ref={tasksRef}
            {...tasksFocus.props}
            data-testid="open-tasks"
            className="min-h-11"
            onClick={onOpenTasks}
          >
            {t('status.tasks')}
          </Button>
        ) : null}
        {badge ? (
          <span
            data-testid="profile-badge"
            className="rounded border border-surface-raised px-2 py-0.5 text-sm uppercase tracking-wider text-text-muted"
          >
            {badge}
          </span>
        ) : null}
      </div>
      {title ? (
        <h1
          data-testid="status-title"
          className="min-w-0 truncate text-center text-xl font-semibold tracking-wide text-text"
        >
          {title}
        </h1>
      ) : null}
      <div className="flex flex-1 items-center justify-end gap-4 text-base text-text-muted">
        {dotClass ? (
          <span
            data-testid="engine-status"
            title={
              engineStatus ? t('status.engineTooltip', { state: engineStatus.state }) : undefined
            }
            className={`h-3 w-3 rounded-full ${dotClass}`}
          />
        ) : null}
        {dictationStatus !== 'idle' ? (
          <span data-testid="dictation-indicator" className="flex items-center gap-2 text-accent">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
            <span>
              {dictationStatus === 'starting' ? t('status.starting') : t('status.listening')}
            </span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised">
              <span
                className="block h-full bg-accent transition-[width] duration-fast"
                style={{ width: `${Math.round(dictationLevel * 100)}%` }}
              />
            </span>
          </span>
        ) : null}
        <span
          data-testid="status-network"
          data-status={network.kind}
          data-level={network.level}
          role="img"
          aria-label={networkLabel}
          title={networkLabel}
          className="flex items-center"
        >
          <NetworkIcon status={network} />
        </span>
        {battery ? (
          <span data-testid="status-battery" className="tabular-nums">
            {Math.round(battery.level * 100)}%{battery.charging ? ' ⚡' : ''}
          </span>
        ) : null}
        <span data-testid="status-time" className="tabular-nums">
          {time}
        </span>
      </div>
    </header>
  )
}
