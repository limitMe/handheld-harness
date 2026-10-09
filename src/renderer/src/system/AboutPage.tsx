import { useEffect, useState } from 'react'
import type { AppInfo, UpdateStatus } from '@shared/ipc'
import { useEngineStatus } from '../engine/useEngineStatus'
import { useTranslation } from '../i18n'
import { UpdateDialog } from '../ui'
import { MenuGroupLabel, MenuRow } from './MenuRow'

export interface AboutPageProps {
  onOpenDebug: (page: 'gamepad' | 'mic' | 'engine' | 'speech') => void
}

/** About & diagnostics (spec 15): versions, engine state, updates and debug entries. */
export function AboutPage({ onOpenDebug }: AboutPageProps) {
  const { t } = useTranslation()
  const [info, setInfo] = useState<AppInfo>()
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [updateOpen, setUpdateOpen] = useState(false)
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

  useEffect(() => {
    const update = window.handheld?.update
    if (!update) return
    let cancelled = false
    update
      .getStatus()
      .then((next) => {
        if (!cancelled) setUpdateStatus(next)
      })
      .catch(() => undefined)
    const unsubscribe = update.onEvent(setUpdateStatus)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const checkForUpdates = (): void => {
    setUpdateOpen(true)
    void window.handheld?.update.check()
  }

  return (
    <div data-testid="about-page">
      <MenuRow
        id="system-menu.first"
        order={0}
        testId="about-open-logs"
        onActivate={() => void window.handheld?.app.openLogDir()}
        onClick={() => void window.handheld?.app.openLogDir()}
      >
        <span>{t('about.openLogs')}</span>
      </MenuRow>

      <MenuGroupLabel>{t('menu.groups.diagnostics')}</MenuGroupLabel>
      <MenuRow
        id="system-menu.about.gamepad"
        order={1}
        testId="about-debug-gamepad"
        onActivate={() => onOpenDebug('gamepad')}
        onClick={() => onOpenDebug('gamepad')}
      >
        <span>{t('about.gamepadProbe')}</span>
      </MenuRow>
      <MenuRow
        id="system-menu.about.mic"
        order={2}
        testId="about-debug-mic"
        onActivate={() => onOpenDebug('mic')}
        onClick={() => onOpenDebug('mic')}
      >
        <span>{t('about.micProbe')}</span>
      </MenuRow>
      <MenuRow
        id="system-menu.about.engine"
        order={3}
        testId="about-debug-engine"
        onActivate={() => onOpenDebug('engine')}
        onClick={() => onOpenDebug('engine')}
      >
        <span>{t('about.engineProbe')}</span>
      </MenuRow>
      <MenuRow
        id="system-menu.about.speech"
        order={4}
        testId="about-debug-speech"
        onActivate={() => onOpenDebug('speech')}
        onClick={() => onOpenDebug('speech')}
      >
        <span>{t('about.speechProbe')}</span>
      </MenuRow>

      <MenuGroupLabel>{t('menu.groups.update')}</MenuGroupLabel>
      <MenuRow
        id="system-menu.about.update"
        order={5}
        testId="about-check-update"
        onActivate={checkForUpdates}
        onClick={checkForUpdates}
      >
        <span>{t('about.checkUpdate')}</span>
      </MenuRow>

      <MenuGroupLabel>{t('menu.groups.build')}</MenuGroupLabel>
      <dl
        data-testid="about-info"
        className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 px-3 text-base"
      >
        <dt className="text-text-muted">{t('about.version')}</dt>
        <dd>{info?.version ?? '—'}</dd>
        <dt className="text-text-muted">{t('about.profile')}</dt>
        <dd>{info?.profile ?? '—'}</dd>
        <dt className="text-text-muted">{t('about.platform')}</dt>
        <dd>{info?.platform ?? '—'}</dd>
        <dt className="text-text-muted">{t('about.engine')}</dt>
        <dd>{status?.state ?? t('about.unknown')}</dd>
        <dt className="text-text-muted">{t('about.engineVersion')}</dt>
        <dd>{status?.state === 'ready' ? status.version : '—'}</dd>
        <dt className="text-text-muted">{t('about.workspace')}</dt>
        <dd className="truncate">{status?.state === 'ready' ? status.workspaceDir || '—' : '—'}</dd>
      </dl>

      <UpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        status={updateStatus}
        onDownload={() => void window.handheld?.update.download()}
        onInstall={() => void window.handheld?.update.install()}
      />
    </div>
  )
}
