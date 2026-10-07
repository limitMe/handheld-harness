import { describe, expect, it } from 'vitest'
import {
  applyDeadzone,
  diffControlStates,
  readGamepadStates,
} from '../../src/renderer/src/input/gamepad'

function makePad(buttons: number[], axes: number[] = []): Gamepad {
  return {
    id: 'test',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    buttons: buttons.map((value) => ({ pressed: value >= 0.5, touched: value > 0, value })),
    axes,
    vibrationActuator: null,
    hapticActuators: [],
  } as unknown as Gamepad
}

describe('applyDeadzone', () => {
  it('snaps values inside the deadzone to zero and keeps the sign outside', () => {
    expect(applyDeadzone(0.2)).toBe(0)
    expect(applyDeadzone(-0.24)).toBe(0)
    expect(applyDeadzone(0.8)).toBe(0.8)
    expect(applyDeadzone(-0.8)).toBe(-0.8)
  })
})

describe('readGamepadStates', () => {
  it('maps button indices to control names and applies the press threshold', () => {
    const states = readGamepadStates(makePad([1, 0, 0.4, 0, 0, 0, 0.7]))

    expect(states.A).toEqual({ pressed: true, value: 1 })
    expect(states.LT).toEqual({ pressed: true, value: 0.7 })
    expect(states.X).toEqual({ pressed: false, value: 0.4 })
  })

  it('maps axes and applies the deadzone', () => {
    const states = readGamepadStates(makePad([], [0, 0, 0.1, -0.8]))

    expect(states.LStickX).toEqual({ pressed: false, value: 0 })
    expect(states.RStickY).toEqual({ pressed: true, value: -0.8 })
  })

  it('needs a larger horizontal deflection before a stick acts like a D-pad', () => {
    const half = readGamepadStates(makePad([], [0.4, 0, 0, 0]))
    expect(half.LStickX).toEqual({ pressed: false, value: 0 })

    const pushed = readGamepadStates(makePad([], [0.7, 0, 0, 0]))
    expect(pushed.LStickX).toEqual({ pressed: true, value: 0.7 })

    // Vertical keeps the normal deadzone so scrolling stays responsive.
    const vertical = readGamepadStates(makePad([], [0, 0.4, 0, 0]))
    expect(vertical.LStickY).toEqual({ pressed: true, value: 0.4 })
  })
})

describe('diffControlStates', () => {
  it('emits edges, analog updates and ignores unchanged controls', () => {
    const down = readGamepadStates(makePad([1]))
    const stillDown = readGamepadStates(makePad([1]))
    const up = readGamepadStates(makePad([0]))

    expect(diffControlStates({}, down).map((change) => change.control)).toEqual(['A'])
    expect(diffControlStates(down, stillDown)).toEqual([])

    const release = diffControlStates(down, up)
    expect(release).toEqual([{ control: 'A', pressed: false, value: 0, source: 'gamepad' }])
  })

  it('emits an analog value change while the stick stays pressed', () => {
    const start = readGamepadStates(makePad([], [0, 0, 0, 0.8]))
    const moved = readGamepadStates(makePad([], [0, 0, 0, 0.4]))

    expect(diffControlStates(start, moved)).toEqual([
      { control: 'RStickY', pressed: true, value: 0.4, source: 'gamepad', valueChanged: true },
    ])
  })
})
