import { createContext, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../App'

export interface AuthUser {
  id: string
  email: string
  full_name: string
  role: string
}

interface AuthContextValue {
  token: string | null
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)

  const login = async (email: string, password: string) => {
    const response = await fetch( API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || 'Invalid credentials')
    }

    const data = await response.json()
    setToken(data.token)
    setUser(data.user)

    const destination = data.user.role === 'regulatory' ? '/regulatory' : '/dashboard'
    navigate(destination, { replace: true })
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    navigate('/login', { replace: true })
  }

  const value = useMemo<AuthContextValue>(() => ({ token, user, login, logout }), [token, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
