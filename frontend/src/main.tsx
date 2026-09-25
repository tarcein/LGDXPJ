import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
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

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(error => console.warn('Service worker registration failed.', error))
  })
}
