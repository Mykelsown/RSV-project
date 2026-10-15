import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Fuel, Landmark, LogIn } from 'lucide-react'
import './LoginPage.css'
import RippleSurface from './components/RippleSurface'
import RippleButton from './components/RippleButton'
import { useAuth } from './auth/AuthContext'

type Side = 'staff' | 'regulator'

const ERROR_HINT = 'Check that the email and password belong to this account type, then try again.'

function LoginFormPanel({
  side,
  dominant,
  onSwitch,
}: {
  side: Side
  dominant: boolean
  onSwitch: () => void
}) {
  const isStaff = side === 'staff'
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter both the email and the password to sign in.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      const reason = err instanceof Error && err.message && !err.message.startsWith('Invalid') ? err.message : 'The email or password is not correct.'
      setError(`${reason} ${ERROR_HINT}`)
      setLoading(false)
    }
  }

  return (
    <RippleSurface
      lift={false}
      variant="glass"
      className={`login-panel login-panel--${side} ${dominant ? 'is-dominant' : 'is-receded'}`}
    >
      <div className="login-panel__head">
        <span className={`login-panel__badge ${isStaff ? 'login-panel__badge--green' : 'login-panel__badge--blue'}`}>
          {isStaff ? 'Refinery operations' : 'Regulatory body'}
        </span>
        <span className="login-panel__mark" aria-hidden="true">
          {isStaff ? <Fuel size={20} strokeWidth={1.75} /> : <Landmark size={20} strokeWidth={1.75} />}
        </span>
      </div>
      <h1>{isStaff ? 'Staff and executive access' : 'NMDPRA oversight access'}</h1>
      <p className="login-panel__intro">
        {isStaff
          ? 'Monitor production, distribution and the verified output ledger.'
          : 'Read-only access to the verified reconciliation records.'}
      </p>
      <form className={`login-panel__form ${dominant ? '' : 'is-hidden'}`} onSubmit={submit} aria-hidden={!dominant}>
        <label>
          <span>Email</span>
          <input
            className={`glass-input ${isStaff ? '' : 'glass-input--regulator'}`}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            tabIndex={dominant ? 0 : -1}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            className={`glass-input ${isStaff ? '' : 'glass-input--regulator'}`}
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            tabIndex={dominant ? 0 : -1}
          />
        </label>
        {error && <p className="login-panel__error" role="alert">{error}</p>}
        <RippleButton type="submit" className={`login-panel__submit ${isStaff ? '' : 'login-panel__submit--blue'}`} disabled={loading} tabIndex={dominant ? 0 : -1}>
          <LogIn size={16} strokeWidth={1.75} /> {loading ? 'Signing in' : 'Sign in'}
        </RippleButton>
      </form>
      <button type="button" className="login-panel__switch" onClick={onSwitch} tabIndex={dominant ? 0 : -1}>
        {isStaff
          ? 'Are you from the NMDPRA? Switch to regulatory access'
          : 'Are you refinery staff? Switch to staff access'}
      </button>
    </RippleSurface>
  )
}

export default function LoginPage() {
  const [side, setSide] = useState<Side>('staff')

  return (
    <div className="login-page">
      <div className="login-page__bg" aria-hidden="true">
        <img src="/images/refinery-hero.jpg" alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
        <div className="login-page__overlay" />
      </div>
      <header className="login-page__top">
        <Link to="/" className="login-page__brand">
          <span className="lp-logo-mark"><Fuel size={18} strokeWidth={1.75} /></span>
          <span>RSV</span>
        </Link>
        <Link to="/" className="login-page__back">
          <ArrowLeft size={15} strokeWidth={1.75} /> Back to the site
        </Link>
      </header>
      <main className="login-panels">
        <LoginFormPanel side="staff" dominant={side === 'staff'} onSwitch={() => setSide('regulator')} />
        <LoginFormPanel side="regulator" dominant={side === 'regulator'} onSwitch={() => setSide('staff')} />
      </main>
    </div>
  )
}
