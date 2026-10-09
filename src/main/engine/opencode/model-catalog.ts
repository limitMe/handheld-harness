import type { ModelCatalog } from '../../../shared/engine'

/** The subset of OpenCode's `/provider` response the models page needs. */
export interface ProviderListData {
  all?: Array<{
    id: string
    name: string
    models: Record<
      string,
      {
        id: string
        name: string
        limit?: { context?: number }
        variants?: Record<string, unknown>
      }
    >
  }>
  /** Ids of providers the user has authenticated. */
  connected?: string[]
}

/** Command shown when nothing is usable yet; OpenCode-specific (spec 15). */
const SETUP_COMMAND = 'opencode auth login'

/**
 * Maps `/provider` into the models-page catalog (spec 15). `all` is the whole
 * catalog but only `connected` providers can actually run, so the rest are
 * hidden. An empty result carries the base-specific login command instead of a
 * dead-end empty state.
 */
export function toModelCatalog(data: ProviderListData): ModelCatalog {
  const connected = new Set(data.connected ?? [])
  const groups = (data.all ?? [])
    .filter((provider) => connected.has(provider.id))
    .map((provider) => ({
      providerId: provider.id,
      name: provider.name,
      models: Object.values(provider.models ?? {}).map((model) => ({
        id: model.id,
        name: model.name,
        ...(typeof model.limit?.context === 'number' ? { contextLimit: model.limit.context } : {}),
        ...(model.variants && Object.keys(model.variants).length > 0
          ? { variants: Object.keys(model.variants) }
          : {}),
      })),
    }))
  return {
    groups,
    ...(groups.length === 0 ? { setupCommand: SETUP_COMMAND } : {}),
  }
}
