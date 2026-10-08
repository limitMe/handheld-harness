import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelGroup } from '@shared/engine'
import { useEngineStatus } from '../engine/useEngineStatus'
import { FocusContainer, useFocusTree } from '../focus'
import { GamepadGlyph } from '../glyphs'
import { useTranslation } from '../i18n'
import { CONTEXT_ORDER, useInputContext } from '../input'
import { useWorkbenchStore } from '../state/store'
import { sessionKey } from '../state/types'
import { MenuCancelProvider, MenuRow } from '../system/MenuRow'
import { cachedModels, loadModels } from '../system/modelsCache'
import { ChoiceDialog, type ChoiceOption } from '../ui'
import { buildSessionInfo, type SessionInfo } from './sessionInfo'
import { formatRelativeTime } from './time'

const DIRECTORY_ID = 'session-info.directory'
const EFFORT_ID = 'session-info.effort'

export interface SessionInfoPageProps {
  open: boolean
  onClose: () => void
}

/** Mounted only while open, so the catalog fetch and focus reset on every open. */
export function SessionInfoPage({ open, onClose }: SessionInfoPageProps) {
  if (!open) return null
  return <SessionInfoBody onClose={onClose} />
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value))
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-surface-raised py-2 last:border-b-0">
      <dt className="shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right tabular-nums text-text">{value}</dd>
    </div>
  )
}

function SessionInfoMetrics({ info }: { info: SessionInfo }) {
  const { t } = useTranslation()
  const unknown = t('sessionInfo.unknown')
  const percent =
    info.contextPercent !== undefined ? `${Math.round(info.contextPercent * 100)}%` : unknown
  return (
    <dl className="mt-2 flex flex-col" data-testid="session-info-metrics">
      <MetricRow label={t('sessionInfo.messages')} value={formatNumber(info.messageCount)} />
      <MetricRow label={t('sessionInfo.provider')} value={info.providerId ?? unknown} />
      <MetricRow label={t('sessionInfo.model')} value={info.modelName ?? info.modelId ?? unknown} />
      <MetricRow
        label={t('sessionInfo.contextLimit')}
        value={info.contextLimit !== undefined ? formatNumber(info.contextLimit) : unknown}
      />
      <MetricRow label={t('sessionInfo.contextUsed')} value={formatNumber(info.contextUsed)} />
      <MetricRow label={t('sessionInfo.contextPercent')} value={percent} />
      <MetricRow label={t('sessionInfo.cost')} value={formatCost(info.cost)} />
      <MetricRow
        label={t('sessionInfo.createdAt')}
        value={info.createdAt !== undefined ? formatDateTime(info.createdAt) : unknown}
      />
      <MetricRow
        label={t('sessionInfo.updatedAt')}
        value={info.updatedAt !== undefined ? formatDateTime(info.updatedAt) : unknown}
      />
    </dl>
  )
}

function SessionInfoBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const tree = useFocusTree()
  const status = useEngineStatus()
  const current = useWorkbenchStore((state) => state.ui.current)
  const sessions = useWorkbenchStore((state) => state.sessions)
  const messages = useWorkbenchStore((state) => state.messages)
  const messagesLoaded = useWorkbenchStore((state) => state.messagesLoaded)
  const defaultModel = useWorkbenchStore((state) => state.defaultModel)
  const engineDefaultModel = useWorkbenchStore((state) => state.engineDefaultModel)
  const capabilities = useWorkbenchStore((state) =>
    state.defaultEngineId ? state.engines[state.defaultEngineId]?.capabilities : undefined,
  )
  const pendingDirectory = useWorkbenchStore((state) => state.pendingDirectory)
  const pendingEffort = useWorkbenchStore((state) => state.pendingEffort)
  const setPendingDirectory = useWorkbenchStore((state) => state.setPendingDirectory)
  const setPendingEffort = useWorkbenchStore((state) => state.setPendingEffort)
  const setSessionEffort = useWorkbenchStore((state) => state.setSessionEffort)

  const [catalog, setCatalog] = useState<ModelGroup[]>(() => cachedModels() ?? [])
  const [effortOpen, setEffortOpen] = useState(false)

  useEffect(() => {
    if (cachedModels()) return undefined
    let cancelled = false
    loadModels()
      .then((list) => {
        if (!cancelled) setCatalog(list)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useInputContext(
    'sessionInfo',
    useMemo(() => ({}), []),
    CONTEXT_ORDER.overlay,
  )

  const key = current ? sessionKey(current) : null
  const summary = key ? sessions[key] : undefined
  const sessionMessages = useMemo(
    () => (key && messagesLoaded[key] ? (messages[key] ?? []) : []),
    [key, messagesLoaded, messages],
  )
  const engineWorkspace = status && status.state === 'ready' ? status.workspaceDir : undefined

  // A new task uses the chosen default model, else whatever the engine would use.
  const effectiveModel = summary?.model ?? defaultModel ?? engineDefaultModel

  const info = useMemo(
    () =>
      buildSessionInfo({
        ...(summary ? { summary } : {}),
        ...(effectiveModel ? { model: effectiveModel } : {}),
        ...(pendingEffort ? { effort: pendingEffort } : {}),
        ...(pendingDirectory ? { directory: pendingDirectory } : {}),
        messages: sessionMessages,
        catalog,
      }),
    [summary, effectiveModel, pendingEffort, pendingDirectory, sessionMessages, catalog],
  )

  const directory = info.directory || engineWorkspace || undefined
  const directoryEditable = !current && Boolean(capabilities?.sessionDirectory)
  const effortSelectable = Boolean(capabilities?.modelEffort) && info.effortOptions.length > 0

  // Focus the first row on mount; the container has no memory yet.
  const focused = useRef(false)
  useEffect(() => {
    if (focused.current || !tree) return
    focused.current = true
    tree.setFocus(directoryEditable ? DIRECTORY_ID : EFFORT_ID)
  }, [tree, directoryEditable])

  const chooseDirectory = (): void => {
    if (!directoryEditable) return
    void window.handheld.app
      .pickDirectory()
      .then((result) => {
        if (result.path) setPendingDirectory(result.path)
      })
      .catch(() => undefined)
  }

  const effortOptions: ChoiceOption[] = info.effortOptions.map((effort) => ({
    id: effort,
    label: effort,
  }))

  const chooseEffort = (effort: string): void => {
    if (current) void setSessionEffort(current, effort)
    else setPendingEffort(effort)
  }

  return (
    <div data-testid="session-info" className="absolute inset-0 z-40 flex flex-col bg-surface/95">
      <FocusContainer id="session-info" flow="column" scope>
        <div className="flex h-full w-full flex-col gap-3 overflow-y-auto px-6 py-6">
          <h2 className="text-xl font-semibold text-text">{t('sessionInfo.title')}</h2>

          <MenuCancelProvider onCancel={onClose}>
            {directoryEditable ? (
              <MenuRow
                id={DIRECTORY_ID}
                order={0}
                testId="session-info-directory"
                onActivate={chooseDirectory}
                onClick={chooseDirectory}
              >
                <span className="shrink-0 text-text-muted">{t('sessionInfo.directory')}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-right text-code">
                    {directory ?? t('sessionInfo.unknown')}
                  </span>
                  <span className="shrink-0 text-text-muted">
                    <GamepadGlyph control="A" size={20} />
                  </span>
                </span>
              </MenuRow>
            ) : (
              <MenuRow id={DIRECTORY_ID} order={0} testId="session-info-directory">
                <span className="shrink-0 text-text-muted">{t('sessionInfo.directory')}</span>
                <span className="truncate text-right text-code">
                  {directory ?? t('sessionInfo.unknown')}
                </span>
              </MenuRow>
            )}

            <MenuRow
              id={EFFORT_ID}
              order={1}
              testId="session-info-effort"
              {...(effortSelectable
                ? { onActivate: () => setEffortOpen(true), onClick: () => setEffortOpen(true) }
                : {})}
            >
              <span className="shrink-0 text-text-muted">{t('sessionInfo.effort')}</span>
              <span className="flex items-center gap-2">
                <span>{info.effort ?? t('sessionInfo.defaultEffort')}</span>
                {effortSelectable ? (
                  <span className="text-text-muted">
                    <GamepadGlyph control="A" size={20} />
                  </span>
                ) : null}
              </span>
            </MenuRow>
          </MenuCancelProvider>

          {info.updatedAt !== undefined ? (
            <p className="text-code text-text-muted" data-testid="session-info-activity">
              {t('sessionInfo.lastActivity', {
                value: formatRelativeTime(info.updatedAt, t),
              })}
            </p>
          ) : null}

          <SessionInfoMetrics info={info} />

          {!current ? (
            <p className="text-code text-text-muted">{t('sessionInfo.newTaskNote')}</p>
          ) : null}
        </div>
      </FocusContainer>

      <ChoiceDialog
        open={effortOpen}
        onOpenChange={setEffortOpen}
        title={t('sessionInfo.effort')}
        description={t('sessionInfo.effortDescription')}
        options={effortOptions}
        {...(info.effort ? { initialId: info.effort } : {})}
        onChoose={chooseEffort}
      />
    </div>
  )
}
