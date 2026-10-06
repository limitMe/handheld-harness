import type { ModelRef } from '../../../shared/engine'

export interface ModelResolutionInput {
  /** Explicitly chosen through `setSessionModel`, persisted across profiles. */
  fromTable?: ModelRef
  /** Model of the last assistant message seen for this session. */
  lastAssistant?: ModelRef
  /** Model the server reports on the session itself. */
  serverModel?: ModelRef
  /** Engine default from the server config. */
  defaultModel?: ModelRef
}

/**
 * Fallback order for the model used by a session (spec 02 section 6):
 * the adapter's table, then the last assistant model, then the server's own
 * session model, then the engine default.
 */
export function resolveSessionModel(input: ModelResolutionInput): ModelRef | undefined {
  return input.fromTable ?? input.lastAssistant ?? input.serverModel ?? input.defaultModel
}
