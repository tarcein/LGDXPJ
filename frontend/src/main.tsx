import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import TvDisplay from './TvDisplay.tsx'

const isTvScreen = new URLSearchParams(window.location.search).get('screen') === 'tv'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isTvScreen ? <TvDisplay /> : <App />}
  </StrictMode>,
)
