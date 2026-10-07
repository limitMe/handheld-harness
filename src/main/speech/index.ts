import { createDoubaoFactory } from './doubao'
import { SpeechService, type SpeechServiceDeps } from './service'

/**
 * The default provider registry (spec 16). Only the Doubao adapter is shipped;
 * adding a provider means appending one factory here plus a settings entry.
 */
export function createSpeechService(deps: SpeechServiceDeps): SpeechService {
  return new SpeechService(deps, [createDoubaoFactory()])
}

export { SpeechService, SpeechNotConfiguredError } from './service'
export type { SpeechProviderContext, SpeechProviderFactory, SpeechServiceDeps } from './service'
export { createCredentialStore } from './credentials'
export type { CredentialStore } from './credentials'
