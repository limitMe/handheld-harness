import { describe, expect, it, vi } from 'vitest'
import {
  fetchReleaseNotes,
  normalizeReleaseNotes,
  releaseApiUrl,
  UPDATE_REPOSITORY,
} from '../../src/main/update/notes'

describe('normalizeReleaseNotes', () => {
  it('trims a string and drops blank input', () => {
    expect(normalizeReleaseNotes('  hello  ')).toBe('hello')
    expect(normalizeReleaseNotes('   ')).toBeUndefined()
    expect(normalizeReleaseNotes(undefined)).toBeUndefined()
    expect(normalizeReleaseNotes(42)).toBeUndefined()
  })

  it('flattens per-version entries', () => {
    expect(
      normalizeReleaseNotes([
        { version: '1.2.0', note: 'Second' },
        { version: '1.1.0', note: 'First' },
      ]),
    ).toBe('1.2.0\nSecond\n\n1.1.0\nFirst')
    expect(normalizeReleaseNotes(['a', 'b'])).toBe('a\n\nb')
  })
})

describe('fetchReleaseNotes', () => {
  it('reads the release body from the GitHub API', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ body: '  ## Changes\n- one  ' }),
    })) as unknown as typeof fetch
    expect(await fetchReleaseNotes('1.2.3', fetchImpl)).toBe('## Changes\n- one')
    expect(fetchImpl).toHaveBeenCalledWith(
      releaseApiUrl('1.2.3'),
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }) }),
    )
    expect(releaseApiUrl('1.2.3')).toContain(
      `/${UPDATE_REPOSITORY.owner}/${UPDATE_REPOSITORY.repo}/releases/tags/v1.2.3`,
    )
  })

  it('returns undefined on a non-ok response or empty body', async () => {
    const notFound = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    expect(await fetchReleaseNotes('1.2.3', notFound)).toBeUndefined()

    const empty = vi.fn(async () => ({
      ok: true,
      json: async () => ({ body: '   ' }),
    })) as unknown as typeof fetch
    expect(await fetchReleaseNotes('1.2.3', empty)).toBeUndefined()
  })
})
