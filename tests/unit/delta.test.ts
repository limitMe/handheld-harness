import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeltaAggregator, type DeltaPayload } from '../../src/main/engine/delta'

describe('DeltaAggregator', () => {
  afterEach(() => vi.useRealTimers())

  it('merges deltas per part and flushes at most once per interval', () => {
    vi.useFakeTimers()
    const flushed: DeltaPayload[] = []
    const aggregator = new DeltaAggregator((payload) => flushed.push(payload), 30)

    aggregator.push({ sessionId: 's', messageId: 'm', partId: 'p', delta: 'a' })
    aggregator.push({ sessionId: 's', messageId: 'm', partId: 'p', delta: 'b' })
    aggregator.push({ sessionId: 's', messageId: 'm', partId: 'q', delta: 'x' })

    expect(flushed).toEqual([])
    vi.advanceTimersByTime(29)
    expect(flushed).toEqual([])
    vi.advanceTimersByTime(1)
    expect(flushed).toEqual([
      { sessionId: 's', messageId: 'm', partId: 'p', delta: 'ab' },
      { sessionId: 's', messageId: 'm', partId: 'q', delta: 'x' },
    ])
  })

  it('separates parts with the same id across messages and sessions', () => {
    vi.useFakeTimers()
    const flushed: DeltaPayload[] = []
    const aggregator = new DeltaAggregator((payload) => flushed.push(payload), 30)
    aggregator.push({ sessionId: 's1', messageId: 'm', partId: 'p', delta: 'a' })
    aggregator.push({ sessionId: 's2', messageId: 'm', partId: 'p', delta: 'b' })
    vi.advanceTimersByTime(30)
    expect(flushed).toHaveLength(2)
  })

  it('flushes immediately on demand without waiting for the timer', () => {
    vi.useFakeTimers()
    const flushed: DeltaPayload[] = []
    const aggregator = new DeltaAggregator((payload) => flushed.push(payload), 30)
    aggregator.push({ sessionId: 's', messageId: 'm', partId: 'p', delta: 'a' })
    aggregator.flushNow()
    expect(flushed).toEqual([{ sessionId: 's', messageId: 'm', partId: 'p', delta: 'a' }])
    vi.advanceTimersByTime(30)
    expect(flushed).toHaveLength(1)
  })

  it('drops pending deltas on dispose', () => {
    vi.useFakeTimers()
    const flushed: DeltaPayload[] = []
    const aggregator = new DeltaAggregator((payload) => flushed.push(payload), 30)
    aggregator.push({ sessionId: 's', messageId: 'm', partId: 'p', delta: 'a' })
    aggregator.dispose()
    vi.advanceTimersByTime(100)
    expect(flushed).toEqual([])
  })
})
