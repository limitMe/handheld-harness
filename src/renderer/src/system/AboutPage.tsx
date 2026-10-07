import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'
import { useEngineStatus } from '../engine/useEngineStatus'
import { MenuGroupLabel, MenuRow } from './MenuRow'

export interface AboutPageProps {
  onOpenDebug: (page: 'gamepad' | 'mic' | 'engine') => void
}

/** About & diagnostics (spec 15): versions, engine state and debug entry points. */
export function AboutPage({ onOpenDebug }: AboutPageProps) {
  const [info, setInfo] = useState<AppInfo>()
  const status = useEngineStatus()

  useEffect(() => {
    const app = window.handheld?.app
    if (!app) return
    let cancelled = false
    app
      .getInfo()
      .then((next) => {
        if (!cancelled) setInfo(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div data-testid="about-page">
      <MenuRow
        id="system-menu.first"
        order={0}
        testId="about-open-logs"
        onActivate={() => void window.handheld?.app.openLogDir()}
        onClick={() => void window.handheld?.app.openLogDir()}
      >
        <span>Open log folder</span>
      </MenuRow>

      <MenuGroupLabel>Diagnostics</MenuGroupLabel>
      <MenuRow
        id="system-menu.about.gamepad"
        order={1}
        testId="about-debug-gamepad"
        onActivate={() => onOpenDebug('gamepad')}
        onClick={() => onOpenDebug('gamepad')}
      >
        <span>Gamepad probe</span>
      </MenuRow>
      <MenuRow
        id="system-menu.about.mic"
        order={2}
        testId="about-debug-mic"
        onActivate={() => onOpenDebug('mic')}
        onClick={() => onOpenDebug('mic')}
      >
        <span>Microphone probe</span>
      </MenuRow>
      <MenuRow
        id="system-menu.about.engine"
        order={3}
        testId="about-debug-engine"
        onActivate={() => onOpenDebug('engine')}
        onClick={() => onOpenDebug('engine')}
      >
        <span>Engine probe</span>
      </MenuRow>

      <MenuGroupLabel>Build</MenuGroupLabel>
      <dl data-testid="about-info" className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 px-3 text-base">
        <dt className="text-text-muted">Version</dt>
        <dd>{info?.version ?? '—'}</dd>
        <dt className="text-text-muted">Profile</dt>
        <dd>{info?.profile ?? '—'}</dd>
        <dt className="text-text-muted">Platform</dt>
        <dd>{info?.platform ?? '—'}</dd>
        <dt className="text-text-muted">Engine</dt>
        <dd>{status?.state ?? 'unknown'}</dd>
        <dt className="text-text-muted">Engine version</dt>
        <dd>{status?.state === 'ready' ? status.version : '—'}</dd>
        <dt className="text-text-muted">Workspace</dt>
        <dd className="truncate">{status?.state === 'ready' ? status.workspaceDir || '—' : '—'}</dd>
      </dl>
    </div>
  )
}
