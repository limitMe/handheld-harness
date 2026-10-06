import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { platformPackageNames, resolveBinary } from '../../src/main/engine/binary'

function lookup(files: string[], packages: Record<string, string>) {
  const fileSet = new Set(files)
  return {
    existsSync: (candidate: string) => fileSet.has(candidate),
    resolvePackageDir: (name: string) => packages[name],
  }
}

const BIN = path.join('C:\\node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe')

describe('platformPackageNames', () => {
  it('prefers the baseline package only on x64', () => {
    expect(platformPackageNames('win32', 'x64')).toEqual([
      'opencode-windows-x64',
      'opencode-windows-x64-baseline',
    ])
    expect(platformPackageNames('win32', 'arm64')).toEqual([
      'opencode-windows-arm64',
      'opencode-windows-arm64-baseline',
    ])
    expect(platformPackageNames('linux', 'x64')).toContain('opencode-linux-x64')
  })
})

describe('resolveBinary', () => {
  it('honors HANDHELD_OPENCODE_BIN first', () => {
    const resolution = resolveBinary({
      env: { HANDHELD_OPENCODE_BIN: 'D:\\tools\\opencode.exe' },
      platform: 'win32',
      arch: 'x64',
      baseDir: 'C:\\repo',
      ...lookup(['D:\\tools\\opencode.exe'], {}),
    })
    expect(resolution.path).toBe('D:\\tools\\opencode.exe')
    expect(resolution.source).toBe('HANDHELD_OPENCODE_BIN')
  })

  it('falls through to the platform package when the explicit path is missing', () => {
    const resolution = resolveBinary({
      env: { HANDHELD_OPENCODE_BIN: 'D:\\missing.exe' },
      platform: 'win32',
      arch: 'x64',
      baseDir: 'C:\\repo',
      ...lookup([BIN], { 'opencode-windows-x64': 'C:\\node_modules\\opencode-windows-x64' }),
    })
    expect(resolution.path).toBe(BIN)
    expect(resolution.source).toBe('node_modules/opencode-windows-x64')
  })

  it('falls back to the opencode-ai wrapper package', () => {
    const wrapper = path.join('C:\\node_modules', 'opencode-ai', 'bin', 'opencode.exe')
    const resolution = resolveBinary({
      env: {},
      platform: 'win32',
      arch: 'x64',
      baseDir: 'C:\\repo',
      ...lookup([wrapper], { 'opencode-ai': 'C:\\node_modules\\opencode-ai' }),
    })
    expect(resolution.path).toBe(wrapper)
    expect(resolution.source).toBe('node_modules/opencode-ai')
  })

  it('does not use PATH unless explicitly allowed', () => {
    const onPath = path.join('C:\\tools', 'opencode.exe')
    expect(() =>
      resolveBinary({
        env: { PATH: 'C:\\tools' },
        platform: 'win32',
        arch: 'x64',
        baseDir: 'C:\\repo',
        ...lookup([onPath], {}),
      }),
    ).toThrow(/HANDHELD_OPENCODE_ALLOW_PATH/)
  })

  it('uses PATH when allowed and lists searched locations on failure', () => {
    const onPath = path.join('C:\\tools', 'opencode.exe')
    const resolution = resolveBinary({
      env: { PATH: 'C:\\tools', HANDHELD_OPENCODE_ALLOW_PATH: '1' },
      platform: 'win32',
      arch: 'x64',
      baseDir: 'C:\\repo',
      ...lookup([onPath], {}),
    })
    expect(resolution.source).toContain('PATH')

    try {
      resolveBinary({
        env: { HANDHELD_OPENCODE_ALLOW_PATH: '1' },
        platform: 'win32',
        arch: 'x64',
        baseDir: 'C:\\repo',
        ...lookup([], {}),
      })
      throw new Error('expected resolveBinary to throw')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('HANDHELD_OPENCODE_BIN')
      expect(message).toContain('opencode-windows-x64')
      expect(message).toContain('PATH')
    }
  })
})
