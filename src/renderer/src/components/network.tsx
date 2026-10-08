import { useEffect, useState, type ReactElement } from 'react'
import { cn } from '../ui'

export type NetworkKind = 'offline' | 'wifi' | 'cellular' | 'ethernet'
export type NetworkLevel = 0 | 1 | 2 | 3

export interface NetworkStatus {
  kind: NetworkKind
  /** Signal bars, 0 when offline. */
  level: NetworkLevel
}

/** Subset of the Network Information API Chromium exposes in Electron. */
export interface NetworkInformationLike {
  type?: string
  effectiveType?: string
  downlink?: number
  addEventListener?(type: string, listener: () => void): void
  removeEventListener?(type: string, listener: () => void): void
}

type NavigatorWithConnection = Navigator & { connection?: NetworkInformationLike }

function connection(): NetworkInformationLike | undefined {
  return (navigator as NavigatorWithConnection).connection
}

function levelFrom(info: NetworkInformationLike | undefined): Exclude<NetworkLevel, 0> {
  const downlink = info?.downlink
  if (typeof downlink === 'number' && Number.isFinite(downlink) && downlink > 0) {
    if (downlink >= 10) return 3
    if (downlink >= 2) return 2
    return 1
  }
  switch (info?.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 1
    case '3g':
      return 2
    default:
      return 3
  }
}

/**
 * Maps the browser's coarse network data onto the status-bar icon. `navigator.onLine`
 * decides offline; the Network Information API refines the technology and bars when
 * it is available, and a handheld is assumed to be on Wi-Fi otherwise.
 */
export function resolveNetworkStatus(
  online: boolean,
  info: NetworkInformationLike | undefined,
): NetworkStatus {
  if (!online) return { kind: 'offline', level: 0 }
  const type = info?.type
  if (type === 'none') return { kind: 'offline', level: 0 }
  const level = levelFrom(info)
  if (type === 'cellular') return { kind: 'cellular', level }
  if (type === 'ethernet') return { kind: 'ethernet', level }
  return { kind: 'wifi', level }
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState(() => resolveNetworkStatus(navigator.onLine, connection()))
  useEffect(() => {
    const update = (): void => setStatus(resolveNetworkStatus(navigator.onLine, connection()))
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    const info = connection()
    info?.addEventListener?.('change', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      info?.removeEventListener?.('change', update)
    }
  }, [])
  return status
}

/** Wi-Fi arcs, outermost first (the strongest bar). Sized to fill the 24 box. */
const WIFI_ARCS = [
  { r: 12.5, width: 2.8 },
  { r: 8.5, width: 2.8 },
  { r: 5, width: 2.8 },
]

/**
 * Center of the Wi-Fi arcs and the origin dot. The block spans from
 * `WIFI_CENTER_Y - 13.9` (outer arc, stroke included) to `WIFI_CENTER_Y + 1.9`
 * (dot), so `18` puts its midpoint on the box center and in line with the
 * charging bolt next to it.
 */
const WIFI_CENTER_Y = 18

function polar(cx: number, cy: number, r: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) }
}

function wifiArc(cx: number, cy: number, r: number): string {
  const start = polar(cx, cy, r, 225)
  const end = polar(cx, cy, r, 315)
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`
}

function WifiGlyph({ level, offline }: { level: NetworkLevel; offline: boolean }): ReactElement {
  return (
    <>
      {WIFI_ARCS.map((arc, index) => {
        const lit = !offline && level >= 3 - index
        return (
          <path
            // The arcs and the dot form one optical block; centering it in the
            // 24 box keeps the glyph level with the charging bolt and the clock
            // in the status bar (the arcs would otherwise sit low in the box).
            key={arc.r}
            d={wifiArc(12, WIFI_CENTER_Y, arc.r)}
            strokeWidth={arc.width}
            strokeLinecap="round"
            className={cn('stroke-current', lit ? '' : 'opacity-30')}
          />
        )
      })}
      <circle
        cx={12}
        cy={WIFI_CENTER_Y}
        r={1.9}
        className={cn('fill-current', !offline && level >= 1 ? '' : 'opacity-30')}
      />
      {offline ? (
        <path d="M2.5 3 L21.5 22" strokeWidth={2.4} strokeLinecap="round" className="stroke-current" />
      ) : null}
    </>
  )
}

const CELL_BARS = [
  { x: 3, height: 5 },
  { x: 8, height: 9 },
  { x: 13, height: 13 },
  { x: 18, height: 17 },
]

function CellularGlyph({ level }: { level: NetworkLevel }): ReactElement {
  return (
    <>
      {CELL_BARS.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={20 - bar.height}
          width={3}
          height={bar.height}
          rx={1}
          className={cn('fill-current', level >= index + 1 ? '' : 'opacity-30')}
        />
      ))}
    </>
  )
}

function EthernetGlyph(): ReactElement {
  return (
    <>
      <rect
        x={4}
        y={7}
        width={16}
        height={9}
        rx={1.5}
        strokeWidth={1.8}
        className="stroke-current"
      />
      <path
        d="M8 7 V5 M12 7 V5 M16 7 V5"
        strokeWidth={1.8}
        strokeLinecap="round"
        className="stroke-current"
      />
      <path d="M12 16 V20" strokeWidth={1.8} strokeLinecap="round" className="stroke-current" />
    </>
  )
}

/** Status-bar network glyph (spec 12): offline, Wi-Fi bars, cellular or wired. */
export function NetworkIcon({
  status,
  size = 24,
}: {
  status: NetworkStatus
  size?: number
}): ReactElement {
  const offline = status.kind === 'offline'
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={offline ? 'text-danger' : 'text-text'}
    >
      {status.kind === 'cellular' ? (
        <CellularGlyph level={status.level} />
      ) : status.kind === 'ethernet' ? (
        <EthernetGlyph />
      ) : (
        <WifiGlyph level={status.level} offline={offline} />
      )}
    </svg>
  )
}
