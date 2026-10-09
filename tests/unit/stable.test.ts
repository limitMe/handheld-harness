import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  chooseRollbackTag,
  formatStableTag,
  nextStableTag,
  parseStableTag,
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
