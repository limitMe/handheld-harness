import type { ModelGroup } from './engine'

/**
 * Filters the model catalog for the settings search field (spec 15). A provider
 * is kept when its own name (or id) matches, or when any of its models match;
 * matching on the provider name keeps all of its models, matching a model keeps
 * only the matching ones. The result drives both the list and its expansion.
 */
export function filterModelGroups(groups: ModelGroup[], query: string): ModelGroup[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return groups

  const result: ModelGroup[] = []
  for (const group of groups) {
    const providerMatches =
      group.name.toLowerCase().includes(needle) || group.providerId.toLowerCase().includes(needle)
    if (providerMatches) {
      result.push(group)
      continue
    }
    const models = group.models.filter(
      (model) =>
        model.name.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle),
    )
    if (models.length > 0) result.push({ ...group, models })
  }
  return result
}
