import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const rendererFiles = walk(path.join(process.cwd(), 'src', 'renderer', 'src'))
const sharedFiles = walk(path.join(process.cwd(), 'src', 'shared'))

function offending(files: string[], pattern: RegExp): string[] {
  return files.filter((file) => pattern.test(readFileSync(file, 'utf8')))
}

describe('module boundaries', () => {
  it('renderer never imports engine SDKs or main-process code', () => {
    const bad = offending(rendererFiles, /from\s+['"](@opencode-ai\/|.*\/main\/)/)
    expect(bad).toEqual([])
  })

  it('shared never imports engine SDKs', () => {
    const bad = offending(sharedFiles, /@opencode-ai\//)
    expect(bad).toEqual([])
  })

  it('renderer never branches on engine kind', () => {
    const bad = offending(
      rendererFiles,
      /\.kind\s*(===|!==|==|!=)\s*['"](opencode|fake)['"]|['"](opencode|fake)['"]\s*(===|!==|==|!=)\s*[\w?.]*\.kind/,
    )
    expect(bad).toEqual([])
  })
})
