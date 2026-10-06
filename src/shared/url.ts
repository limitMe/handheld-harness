/**
 * External link policy. Only absolute http and https URLs may be handed to the
 * OS browser; everything else (file:, javascript:, custom schemes) is rejected.
 */
export function isAllowedExternalUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'http:' || url.protocol === 'https:'
}
