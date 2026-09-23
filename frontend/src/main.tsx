import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import TvDisplay from './TvDisplay.tsx'
import VoiceDeviceDisplay from './VoiceDeviceDisplay.tsx'

const debugScreen = new URLSearchParams(window.location.search).get('screen')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {debugScreen === 'tv' ? <TvDisplay /> : debugScreen === 'voice' ? <VoiceDeviceDisplay /> : <App />}
  </StrictMode>,
)
