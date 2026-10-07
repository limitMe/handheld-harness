import type { EngineStatus } from '@shared/engine'
import { useTranslation } from '../i18n'

export function ErrorBanner({ status }: { status?: EngineStatus }) {
  const { t } = useTranslation()
  if (!status) return null
  if (status.state === 'down') {
    return (
      <div
        data-testid="error-banner"
        role="alert"
        className="shrink-0 border-b border-danger bg-card px-4 py-2 text-base text-danger"
      >
        <span className="font-semibold">{t('errors.engineUnavailable')}</span>
        {status.error}
        {status.hint ? <span className="text-text-muted"> — {status.hint}</span> : null}
      </div>
    )
  }
  if (status.state === 'reconnecting') {
    return (
      <div
        data-testid="error-banner"
        role="status"
        className="shrink-0 border-b border-warning bg-card px-4 py-2 text-base text-warning"
      >
        {t('errors.reconnecting', { attempt: status.attempt })}
        {status.lastError ? <span className="text-text-muted"> — {status.lastError}</span> : null}
      </div>
    )
  }
  return null
}
