import { useEffect, useState } from 'react'
import { useEngineStatus } from '../engine/useEngineStatus'
import { Button } from '../ui'

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

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = (): void => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
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
  title: string
  /** Touch-accessible entry point for the temporary task switcher (spec 03 section 6). */
  onOpenTasks?: () => void
}

export default function StatusBar({ title, onOpenTasks }: StatusBarProps) {
  const time = useClock()
  const online = useOnline()
  const battery = useBattery()
  const engineStatus = useEngineStatus()
  const badge = profileBadge(useProfile())

  const engineDotClass =
    engineStatus?.state === 'ready'
      ? 'bg-success'
      : engineStatus?.state === 'down'
        ? 'bg-danger'
        : engineStatus?.state === 'starting' || engineStatus?.state === 'reconnecting'
          ? 'bg-warning'
          : 'bg-text-muted'

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-surface-raised bg-surface px-4">
      <div className="flex flex-1 items-center justify-start gap-3">
        {onOpenTasks ? (
          <Button data-testid="open-tasks" className="min-h-11" onClick={onOpenTasks}>
            Tasks
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
      <h1
        data-testid="status-title"
        className="text-center text-xl font-semibold tracking-wide text-text"
      >
        {title}
      </h1>
      <div className="flex flex-1 items-center justify-end gap-4 text-base text-text-muted">
        <span data-testid="dictation-indicator" hidden aria-hidden="true" />
        <span
          data-testid="engine-status"
          title={engineStatus ? `engine: ${engineStatus.state}` : 'engine: unknown'}
          className={`h-3 w-3 rounded-full ${engineDotClass}`}
        />
        <span data-testid="status-network">{online ? 'online' : 'offline'}</span>
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
