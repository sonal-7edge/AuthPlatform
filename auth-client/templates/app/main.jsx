import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The library's precompiled stylesheet. Import it once, at the app root.
import '@7edge/auth-client/style.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
