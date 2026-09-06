'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
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
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const savedTheme = document.cookie.match(/(?:^|; )sentinel-theme=(light|dark)/)?.[1]
    const nextTheme = savedTheme === 'light' ? 'light' : 'dark'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
  }, [])

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    document.cookie = `sentinel-theme=${nextTheme}; Max-Age=31536000; Path=/; SameSite=Lax`
  }

  async function continueWithGoogle() {
    setPending(true)
    setError('')
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: '/' })
      if (result.error) setError('Google sign-in could not start. Please try email and password or try again.')
    } catch {
      setError('Google sign-in is temporarily unavailable. Please try again.')
    } finally {
      setPending(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const result = mode === 'sign-in'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name })
      if (result.error) {
        setError(mode === 'sign-in'
          ? 'Sign-in failed. Use the registered officer email and password, or create a new account below.'
          : 'Unable to create the officer account. Check the details and try again.')
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('The authentication service is temporarily unavailable. Please try again.')
    } finally {
      setPending(false)
    }
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
        <button className="auth-theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        <p className="eyebrow">OFFICER ACCESS</p>
        <h2>{mode === 'sign-in' ? 'Welcome back.' : 'Create your console.'}</h2>
        <p className="muted">{mode === 'sign-in' ? 'Sign in to review identity dossiers.' : 'Provision a secure officer account.'}</p>
        {mode === 'sign-in' && <p className="auth-hint">Demo account: officer@sentinel.id</p>}
        <button type="button" className="oauth-button" onClick={continueWithGoogle} disabled={pending}><span className="google-g">G</span> Continue with Google</button>
        <div className="auth-divider"><span>or use email</span></div>
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
