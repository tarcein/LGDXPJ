/* oxlint-disable react/only-export-components -- this is the route-splitting entry point */
import { Component, lazy, StrictMode, Suspense } from 'react'
import type { ReactNode } from 'react'
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

class RootErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error('ZIPPY 화면 오류', error) }
  render() {
    if (this.state.failed) return <div className="loading"><p>화면을 불러오지 못했어요.</p><button className="primary-button" onClick={() => location.reload()}>다시 불러오기</button></div>
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary><Suspense fallback={<div className="loading">ZIPPY를 불러오고 있어요</div>}><ActiveScreen /></Suspense></RootErrorBoundary>
  </StrictMode>,
)

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .catch(error => console.warn('Service worker registration failed.', error))
  })
}
