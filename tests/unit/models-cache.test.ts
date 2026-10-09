// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelCatalog } from '../../src/shared/engine'
import {
  cachedModels,
  clearModelsCache,
  loadModels,
} from '../../src/renderer/src/system/modelsCache'

function installEngine(catalog: ModelCatalog): ReturnType<typeof vi.fn> {
  const listModels = vi.fn(async () => catalog)
  ;(window as unknown as { handheld: unknown }).handheld = { engine: { listModels } }
  return listModels
}

afterEach(() => {
  clearModelsCache()
  delete (window as unknown as { handheld?: unknown }).handheld
})

describe('models cache', () => {
  it('queries once, then serves the cached catalog', async () => {
    const catalog: ModelCatalog = {
      groups: [{ providerId: 'p', name: 'P', models: [{ id: 'm', name: 'M' }] }],
    }
    const listModels = installEngine(catalog)

    expect(cachedModels()).toBeUndefined()
    expect(await loadModels()).toBe(catalog)
    expect(listModels).toHaveBeenCalledTimes(1)
    expect(cachedModels()).toBe(catalog)

    // A later load is a cache hit and does not touch the engine.
    expect(await loadModels()).toBe(catalog)
    expect(listModels).toHaveBeenCalledTimes(1)
  })

  it('keeps the base-specific setup command alongside the groups', async () => {
    const catalog: ModelCatalog = { groups: [], setupCommand: 'opencode auth login' }
    installEngine(catalog)

    expect((await loadModels()).setupCommand).toBe('opencode auth login')
    expect(cachedModels()?.setupCommand).toBe('opencode auth login')
  })

  it('re-queries only when forced', async () => {
    const catalog: ModelCatalog = { groups: [] }
    const listModels = installEngine(catalog)

    await loadModels()
    await loadModels(undefined, true)
    expect(listModels).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight request between callers', async () => {
    let release: (value: ModelCatalog) => void = () => undefined
    const listModels = vi.fn(
      () =>
        new Promise<ModelCatalog>((resolve) => {
          release = resolve
        }),
    )
    ;(window as unknown as { handheld: unknown }).handheld = { engine: { listModels } }

    const first = loadModels()
    const second = loadModels()
    release({ groups: [{ providerId: 'p', name: 'P', models: [] }] })
    await Promise.all([first, second])
    expect(listModels).toHaveBeenCalledTimes(1)
  })
})
