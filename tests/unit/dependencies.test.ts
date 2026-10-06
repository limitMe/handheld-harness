import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe('locked dependencies', () => {
  it('pins opencode-ai and the SDK to the same exact version', () => {
    const opencodeAi = pkg.dependencies['opencode-ai']
    const sdk = pkg.dependencies['@opencode-ai/sdk']
    expect(opencodeAi).toBeTruthy()
    expect(sdk).toBeTruthy()
    expect(opencodeAi).toBe(sdk)
  })

  it('does not use loose version ranges', () => {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      expect(version, `${name} must be pinned`).toMatch(/^\d/)
    }
    expect(pkg.devDependencies.tsx).toMatch(/^\d/)
  })
})
