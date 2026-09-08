'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Moon, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AuthForm() {
  const router = useRouter()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

  async function continueWithCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || password.length < 8) {
      setError('Enter a valid email and a password with at least 8 characters.')
      return
    }
    setPending(true)
    setError('')
    try {
      const result = mode === 'sign-in'
        ? await authClient.signIn.email({ email: email.trim(), password, callbackURL: '/' })
        : await authClient.signUp.email({ email: email.trim(), password, name: email.trim().split('@')[0] })
      if (result.error) {
        console.error('[auth] Credential sign-in failed', result.error)
        setError('We could not verify those credentials. Check your details and try again.')
        return
      }
      router.push('/')
      router.refresh()
    } catch (error) {
      console.error('[auth] Credential auth request failed', error)
      setError('Authentication could not be completed. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  async function continueWithGoogle() {
    setPending(true)
    setError('')
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/` })
      if (result.error) {
        console.error('[auth] Google OAuth start failed', result.error)
        setError(result.error.code === 'INVALID_ORIGIN' ? 'This preview URL is not trusted by the authentication server.' : 'Google sign-in could not start. Check the Google OAuth redirect URL for this deployment.')
      }
    } catch (error) {
      console.error('[auth] Google OAuth request failed', error)
      setError('Google sign-in could not start. Check your connection and try again.')
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
        <p className="auth-copy">An online identity screening console for officers protecting India&apos;s checkpoints, campuses, and communities.</p>
        <div className="auth-proof"><span className="status-dot" /> Secure online analysis services ready</div>
      </section>
      <section className="auth-card">
        <button className="auth-theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        <p className="eyebrow">OFFICER ACCESS</p>
        <h2>{mode === 'sign-in' ? 'Welcome back.' : 'Create your console.'}</h2>
        <p className="muted">{mode === 'sign-in' ? 'Sign in with your verified officer identity.' : 'Create an officer account using email/password or Google.'}</p>
        {mode === 'sign-up' && <p className="auth-hint">Use an official work email where possible. Your account is used to scope cases and audit activity.</p>}
        <form onSubmit={continueWithCredentials}>
          <label htmlFor="auth-email">Work email<input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="officer@department.gov.in" required /></label>
          <label htmlFor="auth-password">Password<div className="password-field"><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" minLength={8} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
          <button type="submit" className="primary-button" disabled={pending}>{pending ? 'Verifying…' : mode === 'sign-in' ? 'Sign in securely' : 'Create officer account'}</button>
        </form>
        <div className="auth-divider"><span>or continue with</span></div>
        <button type="button" className="oauth-button" onClick={continueWithGoogle} disabled={pending}><span className="google-g">G</span> {pending ? 'Connecting…' : mode === 'sign-in' ? 'Continue with Google' : 'Create with Google'}</button>
        {error && <p className="form-error">{error}</p>}
        <button className="text-button" onClick={() => { setError(''); setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in') }}>
          {mode === 'sign-in' ? 'Need an account? Create one' : 'Already registered? Sign in'}
        </button>
        <p className="auth-legal">By continuing, you agree to our <a href="/terms">Terms</a> and acknowledge our <a href="/privacy">Privacy Policy</a>.</p>
      </section>
    </main>
  )
}
