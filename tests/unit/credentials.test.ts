import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
    decryptString: (buffer: Buffer) => buffer.toString('utf8').replace(/^enc:/, ''),
  },
}))

import { createCredentialStore } from '../../src/main/speech/credentials'

let dir: string | undefined

function makeDir(): string {
  dir = mkdtempSync(path.join(tmpdir(), 'hha-credentials-'))
  return dir
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

describe('speech credential store', () => {
  it('keeps one encrypted key per provider and survives a reload', () => {
    const target = makeDir()
    const store = createCredentialStore(target)
    store.set('doubao', 'doubao-key')
    store.set('funasr', 'funasr-key')
    store.set('openai', 'openai-key')

    const reloaded = createCredentialStore(target)
    expect(reloaded.get('doubao')).toBe('doubao-key')
    expect(reloaded.get('funasr')).toBe('funasr-key')
    expect(reloaded.get('openai')).toBe('openai-key')
  })

  it('clearing one provider never touches the others', () => {
    const target = makeDir()
    const store = createCredentialStore(target)
    store.set('doubao', 'doubao-key')
    store.set('openai', 'openai-key')

    store.clear('doubao')

    expect(store.has('doubao')).toBe(false)
    expect(store.get('openai')).toBe('openai-key')
    // Overwriting the active provider likewise leaves the rest alone.
    store.set('openai', 'rotated')
    expect(store.get('openai')).toBe('rotated')
  })
})
