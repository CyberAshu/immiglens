import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { LandingHeader } from './LandingHeader'
import { LandingFooter } from './LandingFooter'
import { BackToTop } from '../../components/BackToTop'

export function LandingLayout() {
  const location = useLocation()

  // Scroll window to top on every route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.pathname])

  return (
    <div className="landing-page min-h-screen bg-brand-offwhite flex flex-col font-sans">
      <LandingHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <LandingFooter />
      <BackToTop />
    </div>
  )
}
