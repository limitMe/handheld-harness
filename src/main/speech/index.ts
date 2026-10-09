import { createDoubaoFactory } from './doubao'
import { createFunAsrFactory } from './funasr'
import { createOpenAiFactory } from './openai'
import { SpeechService, type SpeechServiceDeps } from './service'

/**
 * The default provider registry (spec 16). Only real adapters are shipped; the
 * mock provider is test-only. Adding a provider means appending one factory here
 * plus a settings entry.
 */
export function createSpeechService(deps: SpeechServiceDeps): SpeechService {
  return new SpeechService(deps, [
    createDoubaoFactory(),
    createFunAsrFactory(),
    createOpenAiFactory(),
  ])
}

export { SpeechService, SpeechNotConfiguredError } from './service'
export type { SpeechProviderContext, SpeechProviderFactory, SpeechServiceDeps } from './service'
export { createCredentialStore } from './credentials'
export type { CredentialStore } from './credentials'
