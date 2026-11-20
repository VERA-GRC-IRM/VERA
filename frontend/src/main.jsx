import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import './forms.css'
import './index.css'
import App from './App.jsx'
import ThemeProvider from './contexts/ThemeProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider><App /></ThemeProvider>
  </StrictMode>,
)
