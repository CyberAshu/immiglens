import { Link } from 'react-router-dom'
import { ShieldCheck, Mail } from 'lucide-react'

export function LandingFooter() {
  return (
    <footer className="bg-brand-navy text-brand-offwhite py-16 border-t border-[#1E2329]">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-12 lg:gap-8 mb-16">
          <div className="lg:col-span-2 space-y-6">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="bg-brand-gold p-2 rounded-lg text-white">
                <ShieldCheck size={24} />
              </div>
              <span className="font-bold text-2xl tracking-tight text-white">ImmigLens</span>
            </Link>
            <p className="text-gray-300 max-w-sm text-sm leading-relaxed">
              Automate the capture and organization of LMIA recruitment proof. Generate compliance-ready PDF reports with timestamps effortlessly.
            </p>
            <div className="flex items-center gap-3 text-gray-400 text-sm">
              <Mail size={16} />
              <a href="mailto:support@immiglens.ca" className="hover:text-brand-gold transition-colors">
                support@immiglens.ca
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-white tracking-wide uppercase text-xs">Product</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link to="/how-it-works" className="hover:text-white transition-colors">How it works</Link></li>
              <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link to="/faq" className="hover:text-white transition-colors">FAQ</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Login</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-white tracking-wide uppercase text-xs">Company</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link to="/contact" className="hover:text-white transition-colors">Contact Us</Link></li>
              <li><Link to="/security" className="hover:text-white transition-colors">Security</Link></li>

            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-white tracking-wide uppercase text-xs">Legal</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link to="/legal" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link to="/legal" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/security" className="hover:text-white transition-colors">Security Overview</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} ImmigLens. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="bg-gray-800/50 px-3 py-1 rounded-full text-xs">
              Built for RCICs & Employers
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
