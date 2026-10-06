import { isRepeatable, type ActionId } from '@shared/actions'
import { isAnalogControl } from './gamepad'
import type { ControlChange, InputActionEvent } from './types'

export const DEFAULT_LONG_PRESS_MS = 400
export const DEFAULT_REPEAT_DELAY_MS = 350
export const DEFAULT_REPEAT_INTERVAL_MS = 60

export type BindingResolver = (control: string, phase: 'press' | 'hold') => ActionId | undefined

export interface GestureOptions {
  resolve: BindingResolver
  longPressMs?: number
  repeatDelayMs?: number
  repeatIntervalMs?: number
}

type Fired = 'none' | 'short' | 'hold'

interface ActiveGesture {
  control: string
  analog: boolean
  short?: ActionId
  hold?: ActionId
  fired: Fired
  startedAt: number
  longFiresAt: number
  nextRepeatAt: number | null
  repeatInterval: number
  value: number
}

/**
 * Turns raw control edges into semantic actions. A control bound to both a
 * short and a long press must wait for release or the threshold, which delays
 * the short press by up to `longPressMs` (spec 10).
 */
export class GestureResolver {
  private readonly active = new Map<string, ActiveGesture>()
  private readonly resolve: BindingResolver
  private readonly longPressMs: number
  private readonly repeatDelayMs: number
  private readonly repeatIntervalMs: number

  constructor(options: GestureOptions) {
    this.resolve = options.resolve
    this.longPressMs = options.longPressMs ?? DEFAULT_LONG_PRESS_MS
    this.repeatDelayMs = options.repeatDelayMs ?? DEFAULT_REPEAT_DELAY_MS
    this.repeatIntervalMs = options.repeatIntervalMs ?? DEFAULT_REPEAT_INTERVAL_MS
  }

  handle(change: ControlChange, now: number): InputActionEvent[] {
    if (change.source !== 'gamepad') return []
    const existing = this.active.get(change.control)
    if (change.pressed)
      return existing ? this.onUpdate(existing, change) : this.onPress(change, now)
    return existing ? this.onRelease(existing, now) : []
  }

  tick(now: number): InputActionEvent[] {
    const events: InputActionEvent[] = []
    for (const gesture of this.active.values()) {
      if (gesture.fired === 'none') {
        if (now >= gesture.longFiresAt) this.fireHold(gesture, now, events)
        continue
      }
      if (gesture.nextRepeatAt !== null && now >= gesture.nextRepeatAt) {
        const action = this.actionFor(gesture)
        if (action) events.push(this.event(action, 'repeat', gesture))
        gesture.nextRepeatAt = now + gesture.repeatInterval
      }
    }
    return events
  }

  /** Releases every held control and ends its gesture; used when a device disconnects. */
  reset(): InputActionEvent[] {
    const events: InputActionEvent[] = []
    for (const gesture of this.active.values()) {
      const action = this.actionFor(gesture)
      if (action) events.push(this.event(action, 'end', gesture))
    }
    this.active.clear()
    return events
  }

  private onPress(change: ControlChange, now: number): InputActionEvent[] {
    const short = this.resolve(change.control, 'press')
    const hold = this.resolve(change.control, 'hold')
    if (!short && !hold) return []

    const analog = isAnalogControl(change.control)
    const gesture: ActiveGesture = {
      control: change.control,
      analog,
      short,
      hold,
      fired: 'none',
      startedAt: now,
      longFiresAt: now + this.longPressMs,
      nextRepeatAt: null,
      repeatInterval: this.repeatIntervalMs,
      value: change.value,
    }

    if (analog) {
      const action = short ?? hold
      if (!action) return []
      gesture.fired = short ? 'short' : 'hold'
      this.scheduleRepeat(gesture, action, now)
      this.active.set(gesture.control, gesture)
      return [this.event(action, 'start', gesture)]
    }

    this.active.set(gesture.control, gesture)
    // A hold binding defers the decision to the threshold or release.
    if (hold) return []
    // Short-only bindings fire immediately.
    gesture.fired = 'short'
    this.scheduleRepeat(gesture, short!, now)
    return [this.event(short!, 'start', gesture)]
  }

  private onUpdate(gesture: ActiveGesture, change: ControlChange): InputActionEvent[] {
    if (!gesture.analog || change.value === gesture.value) return []
    gesture.value = change.value
    const action = this.actionFor(gesture)
    if (!action || !isRepeatable(action)) return []
    return [this.event(action, 'repeat', gesture)]
  }

  private onRelease(gesture: ActiveGesture, now: number): InputActionEvent[] {
    this.active.delete(gesture.control)
    const events: InputActionEvent[] = []

    if (gesture.fired === 'none') {
      // Decided late: did the press outlive the long-press threshold?
      const heldLong = gesture.hold !== undefined && now - gesture.startedAt >= this.longPressMs
      if (heldLong) {
        events.push(this.event(gesture.hold!, 'start', gesture))
        events.push(this.event(gesture.hold!, 'end', gesture))
      } else if (gesture.short) {
        events.push(this.event(gesture.short, 'start', gesture))
        events.push(this.event(gesture.short, 'end', gesture))
      }
      return events
    }

    const action = this.actionFor(gesture)
    if (action) events.push(this.event(action, 'end', gesture))
    return events
  }

  private fireHold(gesture: ActiveGesture, now: number, events: InputActionEvent[]): void {
    gesture.fired = 'hold'
    if (gesture.hold) {
      events.push(this.event(gesture.hold, 'start', gesture))
      this.scheduleRepeat(gesture, gesture.hold, now)
    }
  }

  private scheduleRepeat(gesture: ActiveGesture, action: ActionId, now: number): void {
    gesture.nextRepeatAt = isRepeatable(action) ? now + this.repeatDelayMs : null
  }

  private actionFor(gesture: ActiveGesture): ActionId | undefined {
    return gesture.fired === 'hold' ? gesture.hold : gesture.short
  }

  private event(
    action: ActionId,
    phase: InputActionEvent['phase'],
    gesture: ActiveGesture,
  ): InputActionEvent {
    return {
      action,
      phase,
      source: 'gamepad',
      control: gesture.control,
      value: gesture.value,
    }
  }
}
