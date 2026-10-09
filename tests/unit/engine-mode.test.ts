import { describe, expect, it } from 'vitest'
import { resolveEngineMode, resolveWorkspaceDir } from '../../src/main/engine/mode'

describe('resolveEngineMode', () => {
  it('defaults to detached in dev and attached in builds', () => {
    expect(resolveEngineMode({}, true)).toBe('detached')
    expect(resolveEngineMode({}, false)).toBe('attached')
  })

  it('honors an explicit mode and ignores invalid values', () => {
    expect(resolveEngineMode({ HANDHELD_ENGINE_MODE: 'external' }, false)).toBe('external')
    expect(resolveEngineMode({ HANDHELD_ENGINE_MODE: 'fake' }, false)).toBe('fake')
    expect(resolveEngineMode({ HANDHELD_ENGINE_MODE: 'nonsense' }, true)).toBe('detached')
  })
})

describe('resolveWorkspaceDir', () => {
  const base = { env: {}, isDev: false, repositoryRoot: 'C:\\repo' }

  it('prefers the settings value', () => {
    const result = resolveWorkspaceDir({
      ...base,
      settingsWorkspace: 'C:\\work',
      env: { HANDHELD_WORKSPACE: 'C:\\env' },
      isDev: true,
    })
    expect(result.source).toBe('settings')
    expect(result.dir).toBe('C:\\work')
  })

  it('falls back to the environment', () => {
    const result = resolveWorkspaceDir({
      ...base,
      env: { HANDHELD_WORKSPACE: 'C:\\env' },
      isDev: true,
    })
    expect(result.source).toBe('env')
    expect(result.dir).toBe('C:\\env')
  })

  it('uses the repository root in development', () => {
    const result = resolveWorkspaceDir({ ...base, isDev: true })
    expect(result.source).toBe('dev-default')
    expect(result.dir).toBe('C:\\repo')
  })

  it('falls back to the packaged default (documents) in release builds', () => {
    const result = resolveWorkspaceDir({ ...base, defaultWorkspaceDir: 'C:\\Users\\me\\Documents' })
    expect(result.source).toBe('release-default')
    expect(result.dir).toBe('C:\\Users\\me\\Documents')
  })

  it('reports no workspace in production without configuration', () => {
    expect(resolveWorkspaceDir(base)).toEqual({ source: 'none' })
  })
})
