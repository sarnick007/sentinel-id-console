'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AuthForm() {
  const router = useRouter()
  const [email, setEmail] = useState('officer@sentinel.id')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('Field Officer')
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const result = mode === 'sign-in'
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({ email, password, name })
    if (result.error) setError('Unable to authenticate. Check your details and try again.')
    else { router.push('/'); router.refresh() }
    setPending(false)
  }

  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <div className="brand-mark">S</div>
        <p className="eyebrow">SENTINEL-ID / SIH 2026</p>
        <h1>Trust, made visible.</h1>
        <p className="auth-copy">An offline-first identity screening console for the officers who keep borders moving.</p>
        <div className="auth-proof"><span className="status-dot" /> Air-gapped analysis node ready</div>
      </section>
      <section className="auth-card">
        <p className="eyebrow">OFFICER ACCESS</p>
        <h2>{mode === 'sign-in' ? 'Welcome back.' : 'Create your console.'}</h2>
        <p className="muted">{mode === 'sign-in' ? 'Sign in to review identity dossiers.' : 'Provision a secure officer account.'}</p>
        <form onSubmit={submit}>
          {mode === 'sign-up' && <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>}
          <label>Work email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={pending}>{pending ? 'Authenticating…' : mode === 'sign-in' ? 'Enter console' : 'Create account'}</button>
        </form>
        <button className="text-button" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
          {mode === 'sign-in' ? 'Need an account? Create one' : 'Already registered? Sign in'}
        </button>
      </section>
    </main>
  )
}
