/**
 * Engine code must not import electron, so logging is injected by the caller.
 * Every message that may contain a URL or environment value passes through
 * `redact` first; the server password must never reach a log file.
 */

export interface EngineLogger {
  error(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  debug(message: string, meta?: unknown): void
}

export const silentLogger: EngineLogger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
}

/** Replaces any occurrence of the secrets with `***`. Recurses through objects and arrays. */
export function redactSecrets<T>(value: T, secrets: string[]): T {
  const active = secrets.filter((secret) => secret.length > 0)
  if (active.length === 0) return value

  const scrub = (text: string): string => {
    let result = text
    for (const secret of active) {
      result = result.split(secret).join('***')
    }
    return result
  }

  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') return scrub(input)
    if (Array.isArray(input)) return input.map(walk)
    if (input && typeof input === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        out[key] = walk(value)
      }
      return out
    }
    return input
  }

  return walk(value) as T
}

/** Wraps a logger so every string argument is scrubbed before it is written. */
export function createRedactingLogger(logger: EngineLogger, secrets: () => string[]): EngineLogger {
  const wrap =
    (level: keyof EngineLogger) =>
    (message: string, meta?: unknown): void => {
      logger[level](
        redactSecrets(message, secrets()),
        meta === undefined ? undefined : redactSecrets(meta, secrets()),
      )
    }
  return {
    error: wrap('error'),
    warn: wrap('warn'),
    info: wrap('info'),
    debug: wrap('debug'),
  }
}
