import { session } from 'electron'
import { log } from './log'

interface PermissionDetails {
  mediaTypes?: string[] | undefined
  mediaType?: string | undefined
}

function isTrustedOrigin(origin: string): boolean {
  if (origin.startsWith('file://')) return true
  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (!devServerUrl) return false
  return origin.startsWith(devServerUrl)
}

function isAudioOnlyMedia(permission: string, details: PermissionDetails | undefined): boolean {
  if (permission !== 'media') return false
  const types =
    details?.mediaTypes ??
    (details?.mediaType && details.mediaType !== 'unknown' ? [details.mediaType] : undefined)
  if (!types || types.length === 0) return false
  return types.every((type) => type === 'audio')
}

export function installPermissions(): void {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const allowed =
      isTrustedOrigin(webContents.getURL()) &&
      isAudioOnlyMedia(permission, details as PermissionDetails)
    if (!allowed) log.warn('permission denied', { permission, details })
    callback(allowed)
  })

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    return (
      isTrustedOrigin(requestingOrigin) &&
      isAudioOnlyMedia(permission, details as PermissionDetails)
    )
  })
}
