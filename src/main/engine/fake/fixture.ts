import fs from 'node:fs'

/** Loads a recorded JSONL event fixture; returns an empty list when missing. */
export function loadFixtureEvents(filePath: string | undefined): unknown[] {
  if (!filePath) return []
  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as unknown)
  } catch {
    return []
  }
}

/**
 * Rewrites the recorded session id to `sessionId` everywhere it appears, so the
 * replay targets the fake session the renderer actually opened.
 *
 * The recorded id shows up under `sessionID` and also as `info.id`, so the ids
 * are collected first and then matched by value; message and part ids (prefixed
 * `msg_` / `prt_`) are left untouched.
 */
export function remapSessionId(events: unknown[], sessionId: string): unknown[] {
  const recordedIds = new Set<string>()
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) collect(child)
      return
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key === 'sessionID' && typeof child === 'string') recordedIds.add(child)
        else collect(child)
      }
    }
  }
  for (const event of events) collect(event)
  if (recordedIds.size === 0) return events

  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return recordedIds.has(value) ? sessionId : value
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        out[key] = walk(child)
      }
      return out
    }
    return value
  }
  return events.map(walk)
}
