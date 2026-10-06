import { Toast } from '@base-ui/react/toast'
import type { ReactNode } from 'react'

/** Global manager so non-React code (stores, engine events) can raise a toast. */
export const toastManager = Toast.createToastManager()

export interface ToastOptions {
  description?: ReactNode
  type?: string
  timeout?: number
}

/** Non-blocking notice such as "Sent" or "Engine reconnected" (spec 12). */
export function showToast(title: ReactNode, options: ToastOptions = {}): string {
  return toastManager.add({ title, ...options })
}

const viewportStyles = 'fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4'

const rootStyles =
  'w-[min(90vw,420px)] rounded-card border border-surface-raised bg-surface-raised px-4 py-3 text-on-card shadow-card transition-[opacity,transform] duration-ui ease-standard data-[starting-style]:-translate-y-2 data-[starting-style]:opacity-0 data-[ending-style]:-translate-y-2 data-[ending-style]:opacity-0'

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return (
    <>
      {toasts.map((toast) => (
        <Toast.Root key={toast.id} toast={toast} className={rootStyles} data-testid="toast">
          <Toast.Content className="flex flex-col gap-1">
            <Toast.Title className="text-base font-semibold text-text">{toast.title}</Toast.Title>
            {toast.description ? (
              <Toast.Description className="text-sm text-text-muted">
                {toast.description}
              </Toast.Description>
            ) : null}
          </Toast.Content>
        </Toast.Root>
      ))}
    </>
  )
}

/** Mount once near the app root; toasts slide in from the top and auto-dismiss. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} timeout={2500} limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className={viewportStyles}>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
