import { describe, expect, it } from 'vitest'
import {
  ringPoint,
  ringSlotFromStick,
  sectorPath,
  RING_STICK_THRESHOLD,
} from '../../src/renderer/src/workbench/ringGeometry'

describe('ringSlotFromStick', () => {
  it('maps the four cardinal directions to the expected sectors', () => {
    expect(ringSlotFromStick(0, -1)).toBe(0) // top
    expect(ringSlotFromStick(1, 0)).toBe(2) // right (lower-right sector)
    expect(ringSlotFromStick(0, 1)).toBe(3) // bottom
    expect(ringSlotFromStick(-1, 0)).toBe(5) // left (upper-left sector)
  })

  it('rotates clockwise with the stick', () => {
    expect(ringSlotFromStick(0.87, -0.5)).toBe(1) // up-right
    expect(ringSlotFromStick(0.87, 0.5)).toBe(2) // down-right
    expect(ringSlotFromStick(-0.87, 0.5)).toBe(4) // down-left
    expect(ringSlotFromStick(-0.87, -0.5)).toBe(5) // up-left
  })

  it('ignores a resting stick', () => {
    expect(ringSlotFromStick(0, 0)).toBeNull()
    expect(ringSlotFromStick(RING_STICK_THRESHOLD - 0.01, 0)).toBeNull()
  })
})

describe('ring geometry', () => {
  it('reads 0° as the top and grows clockwise', () => {
    expect(ringPoint(0, 0, 10, 0).y).toBeCloseTo(-10)
    expect(ringPoint(0, 0, 10, 90).x).toBeCloseTo(10)
    expect(ringPoint(0, 0, 10, 180).y).toBeCloseTo(10)
  })

  it('builds a closed annular sector path', () => {
    const path = sectorPath(200, 200, 80, 180, -26, 26)
    expect(path.startsWith('M ')).toBe(true)
    expect(path).toContain('A 180 180')
    expect(path).toContain('A 80 80')
    expect(path.endsWith('Z')).toBe(true)
  })
})
