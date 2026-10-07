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

  it('requires a firm deflection before a stick drives navigation or scroll', () => {
    const resting = readGamepadStates(makePad([], [0.4, 0.4, 0, 0]))
    expect(resting.LStickX).toEqual({ pressed: false, value: 0 })
    expect(resting.LStickY).toEqual({ pressed: false, value: 0 })

    const pushed = readGamepadStates(makePad([], [0.7, -0.8, 0, 0]))
    expect(pushed.LStickX).toEqual({ pressed: true, value: 0.7 })
    expect(pushed.LStickY).toEqual({ pressed: true, value: -0.8 })
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
    const start = readGamepadStates(makePad([], [0, 0, 0, 0.9]))
    const moved = readGamepadStates(makePad([], [0, 0, 0, 0.6]))

    expect(diffControlStates(start, moved)).toEqual([
      { control: 'RStickY', pressed: true, value: 0.6, source: 'gamepad', valueChanged: true },
    ])
  })
})
