/* oxlint-disable react/only-export-components -- this is the route-splitting entry point */
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'

const App = lazy(() => import('./App.tsx'))
const TvDisplay = lazy(() => import('./TvDisplay.tsx'))
const VoiceDeviceDisplay = lazy(() => import('./VoiceDeviceDisplay.tsx'))
const PerformanceDashboard = lazy(() => import('./components/PerformanceDashboard.tsx')
  .then(module => ({ default: module.PerformanceDashboard })))

const debugScreen = new URLSearchParams(window.location.search).get('screen')
const pathname = window.location.pathname.replace(/\/+$/, '')
const performanceDashboard = pathname === '/performance' || debugScreen === 'performance'
const ActiveScreen = performanceDashboard ? PerformanceDashboard : debugScreen === 'tv' ? TvDisplay : debugScreen === 'voice' ? VoiceDeviceDisplay : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="loading">ZIPPY를 불러오고 있어요</div>}><ActiveScreen /></Suspense>
  </StrictMode>,
)

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .catch(error => console.warn('Service worker registration failed.', error))
  })
}
