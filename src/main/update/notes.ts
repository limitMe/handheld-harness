/**
 * Release metadata for auto-update (spec 19). The repository must match the
 * `publish` block in `electron-builder.yml`; GitHub is public, so reads are
 * anonymous and no token is shipped in the app.
 */
export const UPDATE_REPOSITORY = { owner: 'limitMe', repo: 'handheld-harness' } as const

export function releaseApiUrl(version: string): string {
  return `https://api.github.com/repos/${UPDATE_REPOSITORY.owner}/${UPDATE_REPOSITORY.repo}/releases/tags/v${version}`
}

/**
 * `updateInfo.releaseNotes` may be a string or an array of per-version notes.
 * Both shapes are flattened into plain text; empty input yields `undefined`.
 */
export function normalizeReleaseNotes(notes: unknown): string | undefined {
  if (typeof notes === 'string') {
    const trimmed = notes.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (Array.isArray(notes)) {
    const parts = notes
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim()
        if (typeof entry === 'object' && entry !== null) {
          const { version, note } = entry as { version?: unknown; note?: unknown }
          const heading = typeof version === 'string' ? version : ''
          const body = typeof note === 'string' ? note.trim() : ''
          return [heading, body].filter(Boolean).join('\n')
        }
        return ''
      })
      .filter((part) => part.length > 0)
    return parts.length > 0 ? parts.join('\n\n') : undefined
  }
  return undefined
}

/** Reads the matching GitHub Release body as a fallback for missing notes. */
export async function fetchReleaseNotes(
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const response = await fetchImpl(releaseApiUrl(version), {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Handheld Harness',
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return undefined
  const data = (await response.json()) as { body?: unknown }
  return typeof data.body === 'string' && data.body.trim().length > 0 ? data.body.trim() : undefined
}
