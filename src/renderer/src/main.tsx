import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FocusProvider } from './focus'
import { HintsProvider } from './hints'
import { InputProvider } from './input'
import { ToastProvider } from './ui'
import './styles/app.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')

createRoot(container).render(
  <StrictMode>
    <ToastProvider>
      <InputProvider>
        <FocusProvider>
          <HintsProvider>
            <App />
          </HintsProvider>
        </FocusProvider>
      </InputProvider>
    </ToastProvider>
  </StrictMode>,
)
