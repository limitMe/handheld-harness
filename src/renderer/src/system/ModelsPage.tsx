import { useEffect, useMemo, useState } from 'react'
import type { ModelGroup, ModelRef } from '@shared/engine'
import type { Settings, SettingsPatch } from '@shared/ipc'
import { useFocusTree } from '../focus'
import { useTranslation } from '../i18n'
import { MenuCancelProvider, MenuRow } from './MenuRow'

export interface ModelsPageProps {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}

function sameModel(a: ModelRef | null | undefined, b: ModelRef | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.providerId === b.providerId && a.modelId === b.modelId
}

/**
 * Model management (spec 15, P-01): sets the default used by new tasks.
 *
 * The engine can report thousands of models (`/provider` returns the whole
 * catalog), so only the expanded provider's models are rendered at a time —
 * one focus-node row per model would overwhelm the focus tree.
 */
export function ModelsPage({ settings, update }: ModelsPageProps) {
  const { t } = useTranslation()
  const tree = useFocusTree()
  const [groups, setGroups] = useState<ModelGroup[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const selected = settings.model.default ?? null
  const [expandedId, setExpandedId] = useState<string | null>(
    () => settings.model.default?.providerId ?? null,
  )

  useEffect(() => {
    const bridge = window.handheld?.engine
    if (!bridge) return
    let cancelled = false
    bridge
      .listModels()
      .then((list) => {
        if (cancelled) return
        setGroups(list)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Leave room for the largest provider's models between two provider rows.
  const stride = useMemo(
    () => groups.reduce((max, group) => Math.max(max, group.models.length), 0) + 1,
    [groups],
  )

  const selectedName = useMemo(
    () =>
      selected
        ? groups
            .find((group) => group.providerId === selected.providerId)
            ?.models.find((model) => model.id === selected.modelId)?.name
        : undefined,
    [groups, selected],
  )

  // Once the catalog arrives, focus the saved model instead of leaving the
  // highlight on "Engine default", so the page reads as the current selection.
  useEffect(() => {
    if (status !== 'ready' || !selected || !tree) return
    if (tree.getFocusedId() !== 'system-menu.first') return
    if (tree.setFocus(`system-menu.models.${selected.providerId}.${selected.modelId}`)) return
    tree.setFocus(`system-menu.models.provider.${selected.providerId}`)
  }, [status, selected, tree])

  const currentLabel = !selected
    ? t('models.engineDefaultAutomatic')
    : (selectedName ?? `${selected.providerId} / ${selected.modelId}`)

  return (
    <div data-testid="models-page">
      <p className="px-3 pt-3 pb-1 text-code text-text-muted" data-testid="models-current">
        {t('models.current', { name: currentLabel })}
      </p>
      <MenuRow
        id="system-menu.first"
        order={0}
        selected={!selected}
        testId="model-engine-default"
        onActivate={() => void update({ model: { default: null } })}
        onClick={() => void update({ model: { default: null } })}
      >
        <span>{t('models.engineDefault')}</span>
        <span className="text-code text-text-muted">{t('models.automatic')}</span>
      </MenuRow>

      {status === 'loading' ? (
        <p className="px-3 py-4 text-text-muted">{t('models.loading')}</p>
      ) : null}
      {status === 'error' ? <p className="px-3 py-4 text-danger">{t('models.loadError')}</p> : null}
      {status === 'ready' && groups.length === 0 ? (
        <p className="px-3 py-4 text-text-muted">{t('models.none')}</p>
      ) : null}

      {groups.map((group, index) => {
        const providerOrder = 100 + index * stride
        const expanded = expandedId === group.providerId
        const currentName =
          selected?.providerId === group.providerId
            ? group.models.find((model) => model.id === selected.modelId)?.name
            : undefined
        return (
          <div key={group.providerId}>
            <MenuRow
              id={`system-menu.models.provider.${group.providerId}`}
              order={providerOrder}
              selected={Boolean(currentName)}
              testId={`model-provider-${group.providerId}`}
              onActivate={() =>
                setExpandedId((id) => (id === group.providerId ? null : group.providerId))
              }
              onClick={() =>
                setExpandedId((id) => (id === group.providerId ? null : group.providerId))
              }
            >
              <span className="truncate">{group.name}</span>
              <span className="text-code text-text-muted">
                {expanded ? '▾' : '▸'}{' '}
                {currentName ?? t('models.count', { value: group.models.length })}
              </span>
            </MenuRow>
            {expanded ? (
              <MenuCancelProvider onCancel={() => setExpandedId(null)}>
                {group.models.length === 0 ? (
                  <p className="px-6 py-2 text-text-muted">{t('models.providerNone')}</p>
                ) : (
                  group.models.map((model, modelIndex) => {
                    const ref: ModelRef = { providerId: group.providerId, modelId: model.id }
                    const isSelected = sameModel(selected, ref)
                    return (
                      <MenuRow
                        key={model.id}
                        id={`system-menu.models.${group.providerId}.${model.id}`}
                        order={providerOrder + 1 + modelIndex}
                        selected={isSelected}
                        testId={`model-${group.providerId}-${model.id}`}
                        className="pl-6"
                        onActivate={() => void update({ model: { default: ref } })}
                        onClick={() => void update({ model: { default: ref } })}
                      >
                        <span className="truncate">{model.name}</span>
                        {isSelected ? (
                          <span className="text-accent">{t('models.default')}</span>
                        ) : null}
                      </MenuRow>
                    )
                  })
                )}
              </MenuCancelProvider>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
