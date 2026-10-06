import { isDevMode } from './env'

export function resolveProfile(): string {
  const raw = process.env.HANDHELD_PROFILE?.trim()
  if (raw) return raw
  return isDevMode() ? 'dev' : 'default'
}
