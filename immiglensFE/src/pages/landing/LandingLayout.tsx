import { Outlet } from 'react-router-dom'
import { LandingHeader } from './LandingHeader'
import { LandingFooter } from './LandingFooter'

export function LandingLayout() {
  return (
    <div className="landing-page min-h-screen bg-brand-offwhite flex flex-col font-sans">
      <LandingHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <LandingFooter />
    </div>
  )
}
