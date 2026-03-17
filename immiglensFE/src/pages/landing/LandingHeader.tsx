import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { ShieldCheck, Menu, X } from 'lucide-react'

const navLinks = [
  { label: 'Product', path: '/' },
  { label: 'How it works', path: '/how-it-works' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'Security', path: '/security' },
  { label: 'FAQ', path: '/faq' },
]

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-brand-navy p-2 rounded-lg text-white">
              <ShieldCheck size={24} />
            </div>
            <span className="font-bold text-xl text-brand-navy tracking-tight">ImmigLens</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navLinks.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.path === '/'}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors hover:text-brand-gold ${isActive ? 'text-brand-gold' : 'text-brand-charcoal'}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center space-x-6">
            <Link to="/login" className="text-sm font-medium text-brand-charcoal hover:text-brand-navy transition-colors">
              Login
            </Link>
            <Link
              to="/register"
              className="bg-brand-gold hover:bg-[#b38e3c] text-white px-6 py-2.5 rounded-md text-sm font-medium shadow-sm transition-all inline-flex items-center justify-center"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Mobile Toggle */}
          <button className="lg:hidden p-2 text-brand-charcoal" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-b border-gray-100 absolute top-20 left-0 right-0 shadow-lg z-50">
          <div className="px-4 pt-2 pb-6 space-y-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.path === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-3 rounded-md text-base font-medium ${isActive ? 'bg-brand-offwhite text-brand-navy' : 'text-brand-charcoal hover:bg-gray-50'}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <div className="pt-4 mt-2 border-t border-gray-100 flex flex-col gap-3 px-3">
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="w-full text-center py-3 font-medium text-brand-charcoal hover:bg-gray-50 rounded-md"
              >
                Login
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileOpen(false)}
                className="w-full text-center py-3 bg-brand-gold hover:bg-[#b38e3c] text-white rounded-md font-medium shadow-sm"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
