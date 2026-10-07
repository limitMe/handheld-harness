// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import { FocusProvider } from '../../src/renderer/src/focus'
import { InputProvider } from '../../src/renderer/src/input'
import { SystemMenu } from '../../src/renderer/src/system/SystemMenu'
import { clearModelsCache } from '../../src/renderer/src/system/modelsCache'

afterEach(() => {
  cleanup()
  delete (window as unknown as { handheld?: unknown }).handheld
})

function installBridge(groups?: unknown): void {
  // The catalog is cached across mounts; each test starts from a cold cache.
  clearModelsCache()
  const settings = structuredClone(DEFAULT_SETTINGS)
  const bridge = {
    settings: {
      get: vi.fn(async () => settings),
      update: vi.fn(async (patch: Record<string, unknown>) => {
        if (patch.model) {
          settings.model = { ...settings.model, ...(patch.model as typeof settings.model) }
        }
        return { ...settings, model: { ...settings.model } }
      }),
    },
    events: { on: vi.fn(() => () => undefined) },
    app: {
      getInfo: vi.fn(async () => ({
        version: '0.1.0',
        profile: 'test',
        platform: 'win32',
        isDev: true,
      })),
      openExternal: vi.fn(async () => undefined),
      openLogDir: vi.fn(async () => undefined),
    },
    engine: {
      listModels: vi.fn(
        async () =>
          groups ?? [
            { providerId: 'fake', name: 'Fake provider', models: [{ id: 'm1', name: 'Model 1' }] },
          ],
      ),
    },
    window: { setZoom: vi.fn(async () => ({ zoom: 1 })) },
  }
  ;(window as unknown as { handheld: unknown }).handheld = bridge
}

function renderMenu() {
  const onClose = vi.fn()
  render(
    <InputProvider>
      <FocusProvider>
        <SystemMenu open onClose={onClose} onOpenDebug={vi.fn()} />
      </FocusProvider>
    </InputProvider>,
  )
  return { onClose }
}

describe('SystemMenu', () => {
  it('focuses the first category and moves with the keyboard', async () => {
    installBridge()
    renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    expect(screen.getByTestId('menu-category-keys').hasAttribute('data-focused')).toBe(true)

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByTestId('menu-category-models').hasAttribute('data-focused')).toBe(true)
  })

  it('enters the panel on A / Enter and returns with Escape', async () => {
    installBridge()
    const { onClose } = renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('models-search').hasAttribute('data-focused')).toBe(true),
    )

    // Back in the panel returns to the category list, it does not close the menu.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByTestId('menu-category-models').hasAttribute('data-focused')).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps a large model catalog collapsed until a provider is expanded', async () => {
    installBridge()
    renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('models-search').hasAttribute('data-focused')).toBe(true),
    )
    await waitFor(() => expect(screen.getByTestId('model-provider-fake')).not.toBeNull())

    // Models are not rendered until the provider row is activated.
    expect(screen.queryByTestId('model-fake-m1')).toBeNull()

    // Focus steps from the search field, past Refresh and "Engine default", to
    // the provider.
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByTestId('models-refresh').hasAttribute('data-focused')).toBe(true),
    )
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByTestId('model-engine-default').hasAttribute('data-focused')).toBe(true),
    )
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByTestId('model-provider-fake').hasAttribute('data-focused')).toBe(true),
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('model-fake-m1')).not.toBeNull())
  })

  it('filters providers and models from the search field', async () => {
    installBridge([
      { providerId: 'openai', name: 'OpenAI', models: [{ id: 'gpt', name: 'GPT' }] },
      { providerId: 'anthropic', name: 'Anthropic', models: [{ id: 'claude', name: 'Claude' }] },
    ])
    renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('model-provider-openai')).not.toBeNull())

    // Matching a model keeps only its provider, and expands it automatically.
    fireEvent.change(screen.getByTestId('models-search-input'), { target: { value: 'claude' } })
    await waitFor(() => expect(screen.queryByTestId('model-provider-openai')).toBeNull())
    expect(screen.getByTestId('model-provider-anthropic')).not.toBeNull()
    expect(screen.getByTestId('model-anthropic-claude')).not.toBeNull()

    // Matching a provider keeps all of its models.
    fireEvent.change(screen.getByTestId('models-search-input'), { target: { value: 'openai' } })
    await waitFor(() => expect(screen.getByTestId('model-provider-openai')).not.toBeNull())
    expect(screen.getByTestId('model-openai-gpt')).not.toBeNull()
    expect(screen.queryByTestId('model-provider-anthropic')).toBeNull()

    // No matches: an empty-state message replaces the list.
    fireEvent.change(screen.getByTestId('models-search-input'), { target: { value: 'zzz' } })
    await waitFor(() => expect(screen.getByTestId('models-no-matches')).not.toBeNull())
    expect(screen.queryByTestId('model-provider-openai')).toBeNull()
  })

  it('only re-queries the engine when Refresh is pressed', async () => {
    installBridge()
    const scope = window as unknown as {
      handheld: { engine: { listModels: ReturnType<typeof vi.fn> } }
    }
    renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('model-provider-fake')).not.toBeNull())
    expect(scope.handheld.engine.listModels).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByTestId('models-refresh').hasAttribute('data-focused')).toBe(true),
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(scope.handheld.engine.listModels).toHaveBeenCalledTimes(2))
  })

  it('does not render a large catalog all at once', async () => {
    installBridge(
      Array.from({ length: 40 }, (_, provider) => ({
        providerId: `p${provider}`,
        name: `Provider ${provider}`,
        models: Array.from({ length: 250 }, (_, model) => ({
          id: `m${model}`,
          name: `Model ${model}`,
        })),
      })),
    )
    renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('model-provider-p39')).not.toBeNull())

    // 10,000 models exist but none are rendered until a provider is expanded.
    expect(screen.queryByTestId('model-p0-m0')).toBeNull()
    expect(screen.queryByTestId('model-p39-m249')).toBeNull()
  })

  it('closes with Escape from the category list', async () => {
    installBridge()
    const { onClose } = renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the selected default model and shows it as current', async () => {
    installBridge()
    renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('models-search').hasAttribute('data-focused')).toBe(true),
    )
    await waitFor(() => expect(screen.getByTestId('model-provider-fake')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByTestId('models-refresh').hasAttribute('data-focused')).toBe(true),
    )
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByTestId('model-engine-default').hasAttribute('data-focused')).toBe(true),
    )
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByTestId('model-provider-fake').hasAttribute('data-focused')).toBe(true),
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('model-fake-m1')).not.toBeNull())
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() =>
      expect(screen.getByTestId('models-current').textContent).toContain('Model 1'),
    )
    expect(screen.getByTestId('model-fake-m1').hasAttribute('data-selected')).toBe(true)
    expect(screen.getByTestId('model-engine-default').hasAttribute('data-selected')).toBe(false)
  })

  it('shows select / back once and hides the fixed bindings', async () => {
    installBridge()
    renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    // Shared select / back appear exactly once, after the device tabs.
    expect(screen.getByTestId('binding-key-shared-nav.activate').textContent).toBe('A')
    expect(screen.getByTestId('binding-key-shared-nav.deactivate').textContent).toBe('B')
    expect(screen.queryByTestId('binding-currentWork-nav.activate')).toBeNull()
    expect(screen.queryByTestId('binding-dialog-nav.deactivate')).toBeNull()

    // Scrolling and the whole system-menu context are fixed and not listed.
    expect(screen.queryByTestId('binding-currentWork-scroll')).toBeNull()
    expect(screen.queryByTestId('binding-systemMenu-nav.up')).toBeNull()
  })

  it('does not let a locked system shortcut be rebound', async () => {
    installBridge()
    renderMenu()
    await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())

    // The keys category is selected on open; Enter enters its panel.
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('keys-device-gamepad').hasAttribute('data-focused')).toBe(true),
    )

    // Walk down to the first locked global row (System menu / Start); the
    // shared select / back rows sit between the device tabs and the groups.
    for (let i = 0; i < 20; i += 1) {
      if (screen.getByTestId('binding-global-menu.toggle').hasAttribute('data-focused')) break
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    }
    const row = screen.getByTestId('binding-global-menu.toggle')
    expect(row.hasAttribute('data-focused')).toBe(true)
    expect(row.textContent).toContain('Locked')

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.queryByTestId('capture-banner')).toBeNull()
  })
})
