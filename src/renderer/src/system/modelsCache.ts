import type { ModelCatalog } from '@shared/engine'

/**
 * Model-catalog cache (spec 15). The engine can return thousands of entries, so
 * the page reads from this cache on open and only re-queries the engine when the
 * user presses Refresh. Promises are shared so two mounts cannot double-fetch.
 */

const DEFAULT_ENGINE = ''

const cache = new Map<string, ModelCatalog>()
const inflight = new Map<string, Promise<ModelCatalog>>()

export function cachedModels(engineId = DEFAULT_ENGINE): ModelCatalog | undefined {
  return cache.get(engineId)
}

export function loadModels(engineId = DEFAULT_ENGINE, force = false): Promise<ModelCatalog> {
  if (!force) {
    const hit = cache.get(engineId)
    if (hit) return Promise.resolve(hit)
    const pending = inflight.get(engineId)
    if (pending) return pending
  }
  const bridge = window.handheld?.engine
  if (!bridge) return Promise.reject(new Error('engine bridge unavailable'))

  const request = bridge
    .listModels(engineId || undefined)
    .then((list) => {
      cache.set(engineId, list)
      inflight.delete(engineId)
      return list
    })
    .catch((error: unknown) => {
      inflight.delete(engineId)
      throw error
    })
  inflight.set(engineId, request)
  return request
}

/** Drops the cache; pass no engine id to clear every entry (tests, engine restart). */
export function clearModelsCache(engineId?: string): void {
  if (engineId === undefined) {
    cache.clear()
    inflight.clear()
    return
  }
  cache.delete(engineId)
  inflight.delete(engineId)
}
