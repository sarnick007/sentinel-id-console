'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AuthForm() {
  const router = useRouter()
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
        <p className="muted">{mode === 'sign-in' ? 'Sign in with your verified officer identity.' : 'Create an officer account with a verified Google email.'}</p>
        {mode === 'sign-up' && <p className="auth-hint">Only Google accounts with a verified email address can create a console.</p>}
        <button type="button" className="oauth-button" onClick={continueWithGoogle} disabled={pending}><span className="google-g">G</span> {pending ? 'Connecting…' : mode === 'sign-in' ? 'Continue with Google' : 'Create with Google'}</button>
        {error && <p className="form-error">{error}</p>}
        <button className="text-button" onClick={() => { setError(''); setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in') }}>
          {mode === 'sign-in' ? 'Need an account? Create one' : 'Already registered? Sign in'}
        </button>
      </section>
    </main>
  )
}
