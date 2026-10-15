import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LandingPage from './LandingPage'
import LoginPage from './LoginPage'

export const API_BASE :string= import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1'

/* Dashboard and regulatory routes are code-split so the public landing page
   stays light. */
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const RegulatoryPage = lazy(() => import('./pages/RegulatoryPage'))

function RouteFallback() {
  return <div className="route-fallback" role="status"><span className="route-fallback__ring" /></div>
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()
  if (!token || !user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RoleRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles: string[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'regulatory' ? '/regulatory' : '/dashboard'} replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><DashboardPage /></Suspense></ProtectedRoute>} />
      <Route path="/regulatory" element={<ProtectedRoute><RoleRoute allowedRoles={['regulatory']}><Suspense fallback={<RouteFallback />}><RegulatoryPage /></Suspense></RoleRoute></ProtectedRoute>} />
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
