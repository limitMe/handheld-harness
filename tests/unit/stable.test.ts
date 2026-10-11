import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  chooseRollbackTag,
  formatStableTag,
  isStableDependenciesHealthy,
  nextStableTag,
  parseStableTag,
  readBuildCommit,
  resolveStableDir,
  sortStableTagsDesc,
} from '../../scripts/lib/stable'

describe('stable path helpers', () => {
  it('places the stable worktree next to the repository', () => {
    const repoRoot = path.join('C:', 'dev', 'handheld-harness')
    const stableDir = resolveStableDir(repoRoot)
    expect(path.dirname(stableDir)).toBe(path.join('C:', 'dev'))
    expect(path.basename(stableDir)).toBe('handheld-harness-stable')
  })

  it('honours an explicit override', () => {
    expect(resolveStableDir('/repo', path.join('D:', 'elsewhere'))).toBe(
      path.resolve(path.join('D:', 'elsewhere')),
    )
    expect(resolveStableDir('/repo', '   ')).toBe(resolveStableDir('/repo'))
  })
})

describe('stable tags', () => {
  it('formats a date and index', () => {
    expect(formatStableTag(new Date(2026, 9, 6), 2)).toBe('stable-20261006-2')
  })

  it('picks the next free index for the day', () => {
    const day = new Date(2026, 9, 6)
    expect(nextStableTag([], day)).toBe('stable-20261006-1')
    expect(nextStableTag(['stable-20261006-1', 'stable-20261006-2'], day)).toBe('stable-20261006-3')
    expect(nextStableTag(['stable-20261005-4'], day)).toBe('stable-20261006-1')
  })

  it('parses only well-formed tags', () => {
    expect(parseStableTag('stable-20261006-2')).toEqual({
      tag: 'stable-20261006-2',
      date: 20261006,
      index: 2,
    })
    expect(parseStableTag('stable-2026-1')).toBeNull()
    expect(parseStableTag('other')).toBeNull()
  })

  it('sorts newest-first by date then numeric index', () => {
    expect(
      sortStableTagsDesc([
        'stable-20261006-2',
        'stable-20260101-1',
        'stable-20261006-10',
        'not-a-tag',
      ]),
    ).toEqual(['stable-20261006-10', 'stable-20261006-2', 'stable-20260101-1'])
  })

  it('chooses the tag older than the current one', () => {
    const tags = ['stable-20261006-2', 'stable-20261006-1', 'stable-20260101-1']
    expect(chooseRollbackTag(tags, 'stable-20261006-2')).toBe('stable-20261006-1')
    expect(chooseRollbackTag(tags, 'stable-20261006-1')).toBe('stable-20260101-1')
    expect(chooseRollbackTag(tags, null)).toBe('stable-20261006-2')
    expect(chooseRollbackTag(tags, 'stable-20260101-1')).toBeNull()
    expect(chooseRollbackTag([], null)).toBeNull()
  })
})

describe('stable build state', () => {
  const dirs: string[] = []

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-state-'))
    dirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads the commit recorded by the last build', () => {
    const dir = tempDir()
    expect(readBuildCommit(dir)).toBeNull()
    fs.mkdirSync(path.join(dir, 'out'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'out', '.stable-build'), 'abc123\n')
    expect(readBuildCommit(dir)).toBe('abc123')
  })

  it('treats a truncated node_modules as unhealthy', () => {
    const dir = tempDir()
    expect(isStableDependenciesHealthy(dir)).toBe(false)
    fs.mkdirSync(path.join(dir, 'node_modules', 'electron-vite', 'bin'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), '')
    expect(isStableDependenciesHealthy(dir)).toBe(false)
    fs.mkdirSync(path.join(dir, 'node_modules', 'electron'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'node_modules', 'electron', 'package.json'), '{}')
    expect(isStableDependenciesHealthy(dir)).toBe(true)
  })
})
