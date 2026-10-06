import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import './LoginPage.css'

type Audience = 'operations' | 'regulatory'

function LoginPage() {
  const { login } = useAuth()
  const [activeAudience, setActiveAudience] = useState<Audience>('operations')
  const [operationsEmail, setOperationsEmail] = useState('')
  const [operationsPassword, setOperationsPassword] = useState('')
  const [regulatoryEmail, setRegulatoryEmail] = useState('')
  const [regulatoryPassword, setRegulatoryPassword] = useState('')
  const [operationsError, setOperationsError] = useState('')
  const [regulatoryError, setRegulatoryError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>, audience: Audience) => {
    event.preventDefault()
    const isOperations = audience === 'operations'
    const email = isOperations ? operationsEmail : regulatoryEmail
    const password = isOperations ? operationsPassword : regulatoryPassword
    const setError = isOperations ? setOperationsError : setRegulatoryError
    setError('')
    try {
      await login(email, password)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to sign in')
    }
  }

  return (
    <main className={`login-page login-page--${activeAudience}`}>
      <Link className="login-home" to="/" aria-label="RSV home">RSV</Link>
      <section className={`login-panel login-panel--operations ${activeAudience === 'operations' ? 'login-panel--active' : 'login-panel--receded'}`}>
        <div className="login-panel-top"><Link className="login-brand" to="/">RSV</Link><span>Internal Operations</span></div>
        <div className="login-panel-content">
          <h1>Dangote Operations Access</h1>
          <p>For operations managers, executives, and trading desk personnel.</p>
          <form className="login-form" onSubmit={(event) => submit(event, 'operations')}>
            <fieldset disabled={activeAudience !== 'operations'}>
              <label>Email<input type="email" autoComplete="username" placeholder="name@company.com" value={operationsEmail} onChange={(event) => setOperationsEmail(event.target.value)} required /></label>
              <label>Password<input type="password" autoComplete="current-password" placeholder="Enter your password" value={operationsPassword} onChange={(event) => setOperationsPassword(event.target.value)} required /></label>
              <button type="submit" className="login-submit">Sign in</button>
              <div className="login-error" role="alert">{operationsError}</div>
            </fieldset>
          </form>
        </div>
        <button className="login-switch" type="button" onClick={() => setActiveAudience('regulatory')}>Are you from the NMDPRA? Switch to regulatory access</button>
      </section>

      <section className={`login-panel login-panel--regulatory ${activeAudience === 'regulatory' ? 'login-panel--active' : 'login-panel--receded'}`}>
        <div className="login-panel-top"><span className="regulatory-badge">NMDPRA</span><span>Verified data access</span></div>
        <div className="login-panel-content">
          <h1>Regulatory Oversight Access</h1>
          <p>For NMDPRA auditors and regulatory personnel. Read-only access to verified refinery data.</p>
          <form className="login-form" onSubmit={(event) => submit(event, 'regulatory')}>
            <fieldset disabled={activeAudience !== 'regulatory'}>
              <label>Email<input type="email" autoComplete="username" placeholder="name@agency.gov.ng" value={regulatoryEmail} onChange={(event) => setRegulatoryEmail(event.target.value)} required /></label>
              <label>Password<input type="password" autoComplete="current-password" placeholder="Enter your password" value={regulatoryPassword} onChange={(event) => setRegulatoryPassword(event.target.value)} required /></label>
              <button type="submit" className="login-submit">Sign in as Regulator</button>
              <div className="login-error" role="alert">{regulatoryError}</div>
            </fieldset>
          </form>
        </div>
        <button className="login-switch" type="button" onClick={() => setActiveAudience('operations')}>Are you Dangote staff? Switch to operations access</button>
      </section>
    </main>
  )
}

export default LoginPage