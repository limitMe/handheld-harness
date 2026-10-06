import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl } from '../../src/shared/url'

describe('external link whitelist', () => {
  it('allows http and https URLs', () => {
    expect(isAllowedExternalUrl('http://example.com')).toBe(true)
    expect(isAllowedExternalUrl('https://example.com/a?b=c#d')).toBe(true)
  })

  it('rejects other schemes and malformed input', () => {
    expect(isAllowedExternalUrl('file:///C:/secret.txt')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('mailto:someone@example.com')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
  })
})
