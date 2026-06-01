import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import { useEffect } from 'react'
import Login from './pages/Login'
import BakeryDashboard from './pages/bakery/BakeryDashboard'
import BakerView from './pages/bakery/BakerView'
import DeliveryView from './pages/bakery/DeliveryView'
import CustomerView from './pages/bakery/CustomerView'

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center text-amber-600">Loading...</div>
)

function RoleRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()
  if (loading || (user && !profile)) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(profile?.role)) return <Navigate to="/login" replace />
  return children
}

function RoleRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading || (user && !profile)) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role === 'baker') return <Navigate to="/baker" replace />
  if (profile?.role === 'delivery') return <Navigate to="/delivery" replace />
  if (profile?.role === 'customer') return <Navigate to="/customer" replace />
  return <Navigate to="/admin" replace />
}

// Prevents back button from leaving the app once logged in
function BackButtonGuard() {
  useEffect(() => {
    // Replace current history entry so there's no "back" to login
    window.history.replaceState({ app: true }, '')

    function handlePopState(e) {
      // If trying to go back to nothing (would exit app), push state again
      if (!e.state || !e.state.app) {
        window.history.pushState({ app: true }, '')
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  return null
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RoleRedirect />} />
      <Route path="/admin" element={<RoleRoute allowedRoles={['admin']}><BackButtonGuard /><BakeryDashboard /></RoleRoute>} />
      <Route path="/baker" element={<RoleRoute allowedRoles={['baker', 'admin']}><BackButtonGuard /><BakerView standalone /></RoleRoute>} />
      <Route path="/delivery" element={<RoleRoute allowedRoles={['delivery', 'admin']}><BackButtonGuard /><DeliveryView standalone /></RoleRoute>} />
      <Route path="/customer" element={<RoleRoute allowedRoles={['customer', 'admin']}><BackButtonGuard /><CustomerView standalone /></RoleRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
