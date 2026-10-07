// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { applyTheme, nextTheme, resolveTheme, themeLabel } from '../../src/renderer/src/system/theme'

describe('theme', () => {
  it('follows the OS preference for the system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('ignores the OS preference for explicit modes', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('cycles through the modes in both directions', () => {
    expect(nextTheme('system', 1)).toBe('dark')
    expect(nextTheme('dark', 1)).toBe('light')
    expect(nextTheme('light', 1)).toBe('system')
    expect(nextTheme('system', -1)).toBe('light')
    expect(nextTheme('light', -1)).toBe('dark')
  })

  it('labels every mode', () => {
    expect(themeLabel('system')).toBe('Follow system')
    expect(themeLabel('dark')).toBe('Dark')
    expect(themeLabel('light')).toBe('Light')
  })

  it('reflects the resolved theme onto <html>', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')

    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
