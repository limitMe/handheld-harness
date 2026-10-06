import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { InputProvider } from './input'
import './styles/app.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')

createRoot(container).render(
  <StrictMode>
    <InputProvider>
      <App />
    </InputProvider>
  </StrictMode>,
)
