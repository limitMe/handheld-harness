/**
 * Coalesces `part.delta` events so the renderer receives at most one merged
 * delta per part every `intervalMs` (spec 02 section 6). Pure timer logic, so
 * it is unit-tested with a fake clock.
 */

export interface DeltaPayload {
  sessionId: string
  messageId: string
  partId: string
  delta: string
}

interface Pending extends DeltaPayload {
  key: string
}

export class DeltaAggregator {
  private readonly pending = new Map<string, Pending>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly flush: (payload: DeltaPayload) => void,
    private readonly intervalMs = 30,
  ) {}

  push(payload: DeltaPayload): void {
    const key = `${payload.sessionId}\u0000${payload.messageId}\u0000${payload.partId}`
    const existing = this.pending.get(key)
    if (existing) {
      existing.delta += payload.delta
    } else {
      this.pending.set(key, { ...payload, key })
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flushNow(), this.intervalMs)
    }
  }

  flushNow(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.size === 0) return
    const batch = [...this.pending.values()]
    this.pending.clear()
    for (const payload of batch) {
      this.flush({
        sessionId: payload.sessionId,
        messageId: payload.messageId,
        partId: payload.partId,
        delta: payload.delta,
      })
    }
  }

  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending.clear()
  }
}
