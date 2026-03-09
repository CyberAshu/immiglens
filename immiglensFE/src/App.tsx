import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
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
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverview from './pages/admin/AdminOverview'
import AdminUsers from './pages/admin/AdminUsers'
import AdminOrganizations from './pages/admin/AdminOrganizations'
import AdminTiers from './pages/admin/AdminTiers'
import AdminReportDesigner from './pages/admin/AdminReportDesigner'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading full-loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="employers/:employerId" element={<EmployerDetail />} />
            <Route path="employers/:employerId/positions/:positionId" element={<PositionDetail />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="organizations" element={<Organizations />} />
            <Route path="changes/postings/:postingId" element={<ChangeHistory />} />
          </Route>

          {/* ── Separate Admin Panel ─────────────── */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="organizations" element={<AdminOrganizations />} />
            <Route path="tiers" element={<AdminTiers />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="report-designer" element={<AdminReportDesigner />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

