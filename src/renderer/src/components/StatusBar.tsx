import { useEffect, useState } from 'react'

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

export interface StatusBarProps {
  title: string
}

export default function StatusBar({ title }: StatusBarProps) {
  const time = useClock()
  const online = useOnline()
  const battery = useBattery()

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-surface-raised bg-surface px-4">
      <div className="flex-1" />
      <h1
        data-testid="status-title"
        className="text-center text-xl font-semibold tracking-wide text-text"
      >
        {title}
      </h1>
      <div className="flex flex-1 items-center justify-end gap-4 text-base text-text-muted">
        <span data-testid="dictation-indicator" hidden aria-hidden="true" />
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
