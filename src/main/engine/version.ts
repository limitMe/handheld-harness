import fs from 'node:fs'
import path from 'node:path'

/**
 * The SDK version is read from the project's own pinned dependency rather than
 * from `@opencode-ai/sdk/package.json`, which the package does not export. The
 * unit test `dependencies.test.ts` asserts the two pinned versions match.
 */
export function readPinnedSdkVersion(baseDir: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(baseDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    return pkg.dependencies?.['@opencode-ai/sdk'] ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}
