import type { EngineCapabilities } from '../../../shared/engine'

/**
 * Full capabilities so the fake engine can stand in for OpenCode during UI
 * development and e2e. Individual flags can be turned off with
 * `HANDHELD_FAKE_CAPABILITIES=streamingDeltas=false,permissionAlways=false`
 * to exercise the UI's capability-based degradation.
 */
export const DEFAULT_FAKE_CAPABILITIES: EngineCapabilities = {
  streamingDeltas: true,
  permissionAlways: true,
  questions: true,
  commands: true,
  deleteSession: true,
  transcriptReplay: true,
  multiClient: true,
  forkSession: false,
}

export type EngineCapabilitiesInput = EngineCapabilities | string

const CAPABILITY_KEYS = Object.keys(DEFAULT_FAKE_CAPABILITIES) as Array<
  keyof EngineCapabilities
>

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return undefined
}

/** Parses `key=value,key2=value2`, ignoring unknown keys and malformed entries. */
export function parseFakeCapabilities(raw: string | undefined): EngineCapabilities {
  const capabilities: EngineCapabilities = { ...DEFAULT_FAKE_CAPABILITIES }
  if (!raw) return capabilities
  for (const entry of raw.split(',')) {
    const [rawKey, rawValue] = entry.split('=')
    const key = rawKey?.trim() as keyof EngineCapabilities | undefined
    if (!key || !rawValue || !CAPABILITY_KEYS.includes(key)) continue
    const parsed = parseBoolean(rawValue)
    if (parsed !== undefined) capabilities[key] = parsed
  }
  return capabilities
}
