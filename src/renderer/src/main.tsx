import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FocusProvider } from './focus'
import { HintsProvider } from './hints'
import { i18n } from './i18n'
import { InputProvider } from './input'
import { ToastProvider } from './ui'
import './styles/app.css'

// Forward renderer errors to the main log so a blank window is diagnosable (spec 01).
window.addEventListener('error', (event) => {
  window.handheld?.log.write('error', 'renderer error', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error instanceof Error ? event.error.stack : undefined,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason
  window.handheld?.log.write('error', 'renderer unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
})

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    window.handheld?.log.write('error', 'renderer crashed', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    })
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col gap-3 overflow-auto bg-surface p-6 font-mono text-text">
          <h1 className="text-xl font-semibold text-danger">{i18n.t('errors.boundaryTitle')}</h1>
          <pre className="whitespace-pre-wrap text-code text-text-muted">
            {this.state.error.message}
          </pre>
          <p className="text-code text-text-muted">{i18n.t('errors.boundaryDetails')}</p>
        </div>
      )
    }
    return this.props.children
  }
}

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <InputProvider>
          <FocusProvider>
            <HintsProvider>
              <App />
            </HintsProvider>
          </FocusProvider>
        </InputProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
