// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelGroup } from '../../src/shared/engine'
import {
  cachedModels,
  clearModelsCache,
  loadModels,
} from '../../src/renderer/src/system/modelsCache'

function installEngine(list: ModelGroup[]): ReturnType<typeof vi.fn> {
  const listModels = vi.fn(async () => list)
  ;(window as unknown as { handheld: unknown }).handheld = { engine: { listModels } }
  return listModels
}

afterEach(() => {
  clearModelsCache()
  delete (window as unknown as { handheld?: unknown }).handheld
})

describe('models cache', () => {
  it('queries once, then serves the cached list', async () => {
    const list: ModelGroup[] = [{ providerId: 'p', name: 'P', models: [{ id: 'm', name: 'M' }] }]
    const listModels = installEngine(list)

    expect(cachedModels()).toBeUndefined()
    expect(await loadModels()).toBe(list)
    expect(listModels).toHaveBeenCalledTimes(1)
    expect(cachedModels()).toBe(list)

    // A later load is a cache hit and does not touch the engine.
    expect(await loadModels()).toBe(list)
    expect(listModels).toHaveBeenCalledTimes(1)
  })

  it('re-queries only when forced', async () => {
    const list: ModelGroup[] = []
    const listModels = installEngine(list)

    await loadModels()
    await loadModels(undefined, true)
    expect(listModels).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight request between callers', async () => {
    let release: (value: ModelGroup[]) => void = () => undefined
    const listModels = vi.fn(
      () =>
        new Promise<ModelGroup[]>((resolve) => {
          release = resolve
        }),
    )
    ;(window as unknown as { handheld: unknown }).handheld = { engine: { listModels } }

    const first = loadModels()
    const second = loadModels()
    release([{ providerId: 'p', name: 'P', models: [] }])
    await Promise.all([first, second])
    expect(listModels).toHaveBeenCalledTimes(1)
  })
})
