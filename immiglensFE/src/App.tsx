import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { UploadProvider } from './context/UploadContext'
import Layout from './pages/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import EmployerDetail from './pages/EmployerDetail'
import PositionDetail from './pages/PositionDetail'
import Subscriptions from './pages/Subscriptions'
import AuditLogs from './pages/AuditLogs'
import Notifications from './pages/Notifications'
import Organizations from './pages/Organizations'
import ChangeHistory from './pages/ChangeHistory'
import Employers from './pages/Employers'
import ReportPreview from './pages/ReportPreview'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverview from './pages/admin/AdminOverview'
import AdminUsers from './pages/admin/AdminUsers'
import AdminOrganizations from './pages/admin/AdminOrganizations'
import AdminTiers from './pages/admin/AdminTiers'
import AdminReportDesigner from './pages/admin/AdminReportDesigner'
import AdminNocCodes from './pages/admin/AdminNocCodes'
// Landing pages
import { LandingLayout } from './pages/landing/LandingLayout'
import { LandingHome } from './pages/landing/LandingHome'
import { LandingHowItWorks } from './pages/landing/LandingHowItWorks'
import { LandingPricing } from './pages/landing/LandingPricing'
import { LandingSecurity } from './pages/landing/LandingSecurity'
import { LandingFAQ } from './pages/landing/LandingFAQ'
import { LandingContact } from './pages/landing/LandingContact'
import { LandingLegal } from './pages/landing/LandingLegal'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading full-loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <UploadProvider>
      <Router>
        <Routes>
          {/* ── Public Landing Pages ─────────────── */}
          <Route path="/" element={<LandingLayout />}>
            <Route index element={<LandingHome />} />
            <Route path="how-it-works" element={<LandingHowItWorks />} />
            <Route path="pricing" element={<LandingPricing />} />
            <Route path="security" element={<LandingSecurity />} />
            <Route path="faq" element={<LandingFAQ />} />
            <Route path="contact" element={<LandingContact />} />
            <Route path="legal" element={<LandingLegal />} />
          </Route>

          {/* ── Auth ─────────────────────────────── */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* ── App (protected) ─────────────────── */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/employers" element={<Employers />} />
            <Route path="/employers/:employerId" element={<EmployerDetail />} />
            <Route path="/employers/:employerId/positions/:positionId" element={<PositionDetail />} />
            <Route path="/employers/:employerId/positions/:positionId/report-preview" element={<ReportPreview />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/organizations" element={<Organizations />} />
            <Route path="/changes/postings/:postingId" element={<ChangeHistory />} />
          </Route>

          {/* ── Separate Admin Panel ─────────────── */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="organizations" element={<AdminOrganizations />} />
            <Route path="tiers" element={<AdminTiers />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="report-designer" element={<AdminReportDesigner />} />
            <Route path="noc-codes" element={<AdminNocCodes />} />
          </Route>
        </Routes>
      </Router>
      </UploadProvider>
    </AuthProvider>
  )
}

