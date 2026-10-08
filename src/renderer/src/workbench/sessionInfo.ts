import type { ChatMessage, ModelGroup, ModelRef, SessionSummary } from '@shared/engine'

/**
 * Everything the session-info page shows (spec 21). Computed in the renderer from
 * data the engine already exposes: the session summary, its transcript (which
 * carries per-turn token/cost usage) and the model catalog (context window and
 * effort options). Pure so it can be unit-tested.
 */
export interface SessionInfo {
  messageCount: number
  providerId?: string
  modelId?: string
  modelName?: string
  contextLimit?: number
  contextUsed: number
  /** 0..1; undefined when the model reports no context window. */
  contextPercent?: number
  cost: number
  createdAt?: number
  updatedAt?: number
  effort?: string
  effortOptions: string[]
  directory?: string
}

export interface SessionInfoInput {
  summary?: SessionSummary
  /** Overrides the summary's model (used by the new-task page). */
  model?: ModelRef
  /** Overrides the summary's effort (the new-task pending value). */
  effort?: string
  /** Overrides the summary's directory (the new-task pending value). */
  directory?: string
  messages: ChatMessage[]
  catalog: ModelGroup[]
}

function findModel(
  catalog: ModelGroup[],
  ref?: ModelRef,
): { name: string; contextLimit?: number; variants?: string[] } | undefined {
  if (!ref) return undefined
  const group = catalog.find((candidate) => candidate.providerId === ref.providerId)
  const model = group?.models.find((candidate) => candidate.id === ref.modelId)
  if (!model) return undefined
  return {
    name: model.name,
    ...(model.contextLimit !== undefined ? { contextLimit: model.contextLimit } : {}),
    ...(model.variants ? { variants: model.variants } : {}),
  }
}

/** Latest assistant usage holds the current context size; every turn sums into cost. */
function aggregate(messages: ChatMessage[]): { contextUsed: number; cost: number } {
  let contextUsed = 0
  let latest = -1
  let cost = 0
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.usage) continue
    cost += message.usage.cost
    if (message.createdAt >= latest) {
      latest = message.createdAt
      contextUsed = message.usage.total
    }
  }
  return { contextUsed, cost }
}

export function buildSessionInfo(input: SessionInfoInput): SessionInfo {
  const { summary, messages, catalog } = input
  const model = input.model ?? summary?.model
  const entry = findModel(catalog, model)
  const { contextUsed, cost } = aggregate(messages)
  const contextLimit = entry?.contextLimit
  const effort = input.effort ?? summary?.effort
  const variants = entry?.variants ?? []
  const effortOptions = variants.length > 0 ? variants : effort ? [effort] : []
  const directory = input.directory ?? summary?.directory
  return {
    messageCount: messages.length,
    ...(model?.providerId ? { providerId: model.providerId } : {}),
    ...(model?.modelId ? { modelId: model.modelId } : {}),
    ...(entry?.name ? { modelName: entry.name } : {}),
    ...(contextLimit !== undefined ? { contextLimit } : {}),
    contextUsed,
    ...(contextLimit && contextLimit > 0 ? { contextPercent: contextUsed / contextLimit } : {}),
    cost,
    ...(summary?.createdAt !== undefined ? { createdAt: summary.createdAt } : {}),
    ...(summary?.updatedAt !== undefined ? { updatedAt: summary.updatedAt } : {}),
    ...(effort ? { effort } : {}),
    effortOptions,
    ...(directory ? { directory } : {}),
  }
}
