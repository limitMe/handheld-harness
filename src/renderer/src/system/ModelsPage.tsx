import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ModelGroup, ModelRef } from '@shared/engine'
import type { Settings, SettingsPatch } from '@shared/ipc'
import { filterModelGroups } from '@shared/model-search'
import { touchRecentModel } from '@shared/model-recents'
import { dictation, type DictationTarget } from '../dictation'
import { useFocusTree, useFocusable } from '../focus'
import { useTranslation } from '../i18n'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { deleteBackward } from '../workbench/textEditing'
import { MenuCancelProvider, MenuRow, useMenuCancel } from './MenuRow'
import { cachedModels, loadModels } from './modelsCache'

export interface ModelsPageProps {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}

const SEARCH_ID = 'system-menu.first'
/** Search sits at the top; the default row and providers follow well below. */
const SEARCH_ORDER = 0
const REFRESH_ORDER = 50
const DEFAULT_ORDER = 100
const PROVIDER_ORDER = 200

/** Filtering starts only after this many characters... */
export const SEARCH_MIN_CHARS = 3
/** ...and this long after the field stops changing, so typing stays responsive. */
export const SEARCH_DEBOUNCE_MS = 2000

function sameModel(a: ModelRef | null | undefined, b: ModelRef | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.providerId === b.providerId && a.modelId === b.modelId
}

/** Gamepad X deletes one character while the search field is active (spec 15). */
function ModelSearchInputContext({ onDelete }: { onDelete: () => void }) {
  useInputContext(
    'systemMenu.models',
    { 'input.deleteBackward': onPress(onDelete) },
    CONTEXT_ORDER.activated,
  )
  return null
}

/**
 * The model search field. It is a focus-tree node (the wrapper) rather than the
 * input itself, so arrow keys still navigate while it is merely focused; the
 * input only takes the DOM focus once activated. Long-press Y dictates into it
 * and X deletes, mirroring the composer (spec 16).
 *
 * The raw text lives here so typing never re-renders the catalog; the parent
 * only hears the debounced, length-gated query it should filter by.
 */
function ModelSearchRow({ onApply }: { onApply: (query: string) => void }) {
  const { t } = useTranslation()
  const tree = useFocusTree()
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const textRef = useRef(text)
  useEffect(() => {
    textRef.current = text
  })
  const cancel = useMenuCancel()

  // Apply only after a pause, and only from the minimum length on. The clear is
  // debounced too, which keeps every state update out of the effect body.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = text.trim()
      onApply(trimmed.length >= SEARCH_MIN_CHARS ? trimmed : '')
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text, onApply])

  const focus = useFocusable({
    id: SEARCH_ID,
    elementRef: wrapperRef,
    order: SEARCH_ORDER,
    activatable: true,
    onActivate: () => inputRef.current?.focus(),
    onDeactivate: () => inputRef.current?.blur(),
    ...(cancel ? { onCancel: cancel } : {}),
  })

  const dictationTarget = useMemo<DictationTarget>(
    () => ({
      getValue: () => textRef.current,
      getSelection: () => {
        const element = inputRef.current
        const length = textRef.current.length
        return element
          ? { start: element.selectionStart ?? length, end: element.selectionEnd ?? length }
          : { start: length, end: length }
      },
      apply: (result) => {
        textRef.current = result.value
        setText(result.value)
        const element = inputRef.current
        if (element) {
          element.value = result.value
          element.setSelectionRange(result.selectionStart, result.selectionEnd)
        }
      },
      activate: () => tree?.activate(SEARCH_ID),
      isActivated: () => focus.activated,
      isAlive: () => inputRef.current !== null,
    }),
    [tree, focus.activated],
  )

  useEffect(() => {
    if (!focus.focused && !focus.activated) {
      dictation.registerTarget(null)
      return undefined
    }
    dictation.registerTarget(dictationTarget)
    return () => dictation.registerTarget(null)
  }, [focus.focused, focus.activated, dictationTarget])

  const deleteBackwardAtCaret = useCallback(() => {
    const element = inputRef.current
    if (!element) return
    const length = element.value.length
    const next = deleteBackward(
      element.value,
      element.selectionStart ?? length,
      element.selectionEnd ?? length,
    )
    element.value = next.value
    element.setSelectionRange(next.position, next.position)
    setText(next.value)
  }, [])

  return (
    <>
      <div
        ref={wrapperRef}
        {...focus.props}
        data-testid="models-search"
        className="flex min-h-11 w-full items-center gap-2 rounded-md border border-surface-raised bg-surface px-3 py-2 text-base text-text"
      >
        <span aria-hidden="true" className="text-text-muted">
          ⌕
        </span>
        <input
          ref={inputRef}
          data-testid="models-search-input"
          type="text"
          value={text}
          placeholder={t('models.searchPlaceholder')}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            // The field blurs before the window handler runs; stop the event so
            // the chrome layer cannot treat the Escape as a page-level shortcut.
            event.stopPropagation()
            tree?.deactivate()
          }}
          className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-muted"
        />
      </div>
      {focus.activated ? <ModelSearchInputContext onDelete={deleteBackwardAtCaret} /> : null}
    </>
  )
}

/**
 * Model management (spec 15, P-01): sets the default used by new tasks.
 *
 * The engine can report thousands of models (`/provider` returns the whole
 * catalog), so only the expanded provider's models are rendered at a time —
 * one focus-node row per model would overwhelm the focus tree. The search field
 * filters the providers and models by name and expands the matches.
 */
export function ModelsPage({ settings, update }: ModelsPageProps) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<ModelGroup[]>(() => cachedModels()?.groups ?? [])
  const [setupCommand, setSetupCommand] = useState<string | undefined>(
    () => cachedModels()?.setupCommand,
  )
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    cachedModels() ? 'ready' : 'loading',
  )
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  // Stable so the search row's debounce effect is not reset on every render.
  const applyQuery = useCallback((next: string) => setQuery(next), [])
  const selected = settings.model.default ?? null
  const [expandedId, setExpandedId] = useState<string | null>(
    () => settings.model.default?.providerId ?? null,
  )

  // Cold start only: a cached catalog is already in the initial state above.
  useEffect(() => {
    if (cachedModels()) return undefined
    let cancelled = false
    loadModels()
      .then((catalog) => {
        if (cancelled) return
        setGroups(catalog.groups)
        setSetupCommand(catalog.setupCommand)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Refresh bypasses the cache and re-queries the engine (spec 15).
  const refresh = useCallback(() => {
    setRefreshing(true)
    loadModels(undefined, true)
      .then((catalog) => {
        setGroups(catalog.groups)
        setSetupCommand(catalog.setupCommand)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
      .finally(() => setRefreshing(false))
  }, [])

  const searching = query.trim().length > 0
  const visibleGroups = useMemo(() => filterModelGroups(groups, query), [groups, query])

  // Leave room for the largest provider's models between two provider rows.
  const stride = useMemo(
    () => visibleGroups.reduce((max, group) => Math.max(max, group.models.length), 0) + 1,
    [visibleGroups],
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

  const currentLabel = !selected
    ? t('models.engineDefaultAutomatic')
    : (selectedName ?? `${selected.providerId} / ${selected.modelId}`)

  // Choosing a default also feeds the recent-model ring (spec 14). "Engine
  // default" is not a model, so it leaves the recent list untouched.
  const chooseModel = (ref: ModelRef, name?: string): void => {
    void update({
      model: { default: ref, recent: touchRecentModel(settings.model.recent, ref, name) },
    })
  }

  return (
    <div data-testid="models-page">
      <ModelSearchRow onApply={applyQuery} />

      <MenuRow
        id="system-menu.models.refresh"
        order={REFRESH_ORDER}
        testId="models-refresh"
        onActivate={refresh}
        onClick={refresh}
      >
        <span>{refreshing ? t('models.refreshing') : t('models.refresh')}</span>
      </MenuRow>

      <p className="px-3 pt-3 pb-1 text-code text-text-muted" data-testid="models-current">
        {t('models.current', { name: currentLabel })}
      </p>
      <MenuRow
        id="system-menu.models.default"
        order={DEFAULT_ORDER}
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
        setupCommand ? (
          <p className="px-3 py-4 text-text-muted" data-testid="models-setup-hint">
            {t('models.setupHint', { command: setupCommand })}
          </p>
        ) : (
          <p className="px-3 py-4 text-text-muted">{t('models.none')}</p>
        )
      ) : null}
      {status === 'ready' && searching && visibleGroups.length === 0 ? (
        <p className="px-3 py-4 text-text-muted" data-testid="models-no-matches">
          {t('models.noMatches')}
        </p>
      ) : null}

      {visibleGroups.map((group, index) => {
        const providerOrder = PROVIDER_ORDER + index * stride
        const expanded = searching || expandedId === group.providerId
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
                        onActivate={() => chooseModel(ref, model.name)}
                        onClick={() => chooseModel(ref, model.name)}
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
