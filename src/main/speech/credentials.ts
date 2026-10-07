import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'

/**
 * Encrypted per-provider API keys (spec 16, P-20). Secrets never live in
 * `settings.json`: they are encrypted with the OS credential store and kept in
 * a profile-private file so they cannot leak through `settings:get`.
 */
export interface CredentialStore {
  has(providerId: string): boolean
  get(providerId: string): string | undefined
  set(providerId: string, secret: string): void
  clear(providerId: string): void
}

interface CredentialsFile {
  version: 1
  entries: Record<string, string>
}

export function createCredentialStore(userDataDir: string): CredentialStore {
  const file = path.join(userDataDir, 'speech-credentials.json')
  let entries = load()

  function load(): Record<string, string> {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CredentialsFile
      return parsed.version === 1 && parsed.entries ? parsed.entries : {}
    } catch {
      return {}
    }
  }

  function persist(): void {
    fs.mkdirSync(userDataDir, { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
  }

  function requireEncryption(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS credential encryption is unavailable on this machine')
    }
  }

  return {
    has: (providerId) => typeof entries[providerId] === 'string',
    get: (providerId) => {
      const stored = entries[providerId]
      if (!stored) return undefined
      requireEncryption()
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    },
    set: (providerId, secret) => {
      requireEncryption()
      entries = { ...entries, [providerId]: safeStorage.encryptString(secret).toString('base64') }
      persist()
    },
    clear: (providerId) => {
      if (!(providerId in entries)) return
      const next = { ...entries }
      delete next[providerId]
      entries = next
      persist()
    },
  }
}
