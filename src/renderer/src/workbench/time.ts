import type { Translate } from '../i18n'

/** Compact relative time for the task switcher (spec 03 section 6). */
export function formatRelativeTime(
  timestamp: number,
  t: Translate,
  now: number = Date.now(),
): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return t('time.secondsAgo', { value: seconds })
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return t('time.minutesAgo', { value: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('time.hoursAgo', { value: hours })
  return t('time.daysAgo', { value: Math.round(hours / 24) })
}
