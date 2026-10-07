import { useEffect, useMemo, useState } from 'react'
import type { ModelGroup, ModelRef } from '@shared/engine'
import type { Settings, SettingsPatch } from '@shared/ipc'
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

  return (
    <div data-testid="models-page">
      <MenuRow
        id="system-menu.first"
        order={0}
        selected={!selected}
        testId="model-engine-default"
        onActivate={() => void update({ model: { default: null } })}
        onClick={() => void update({ model: { default: null } })}
      >
        <span>Engine default</span>
        <span className="text-code text-text-muted">Automatic</span>
      </MenuRow>

      {status === 'loading' ? (
        <p className="px-3 py-4 text-text-muted">Loading models…</p>
      ) : null}
      {status === 'error' ? (
        <p className="px-3 py-4 text-danger">Could not load models from the engine.</p>
      ) : null}
      {status === 'ready' && groups.length === 0 ? (
        <p className="px-3 py-4 text-text-muted">The engine reported no models.</p>
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
              onActivate={() => setExpandedId((id) => (id === group.providerId ? null : group.providerId))}
              onClick={() => setExpandedId((id) => (id === group.providerId ? null : group.providerId))}
            >
              <span className="truncate">{group.name}</span>
              <span className="text-code text-text-muted">
                {expanded ? '▾' : '▸'} {currentName ?? `${group.models.length} models`}
              </span>
            </MenuRow>
            {expanded ? (
              <MenuCancelProvider onCancel={() => setExpandedId(null)}>
                {group.models.length === 0 ? (
                  <p className="px-6 py-2 text-text-muted">This provider reported no models.</p>
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
                        {isSelected ? <span className="text-accent">Default</span> : null}
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
