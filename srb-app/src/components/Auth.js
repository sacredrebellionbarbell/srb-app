import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
const logo = process.env.PUBLIC_URL + '/logo.jpg'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const login = async () => {
    setLoading(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setErr(error.message)
    setLoading(false)
  }

  const register = async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    setLoading(true); setErr('')
    const { error } = await supabase.auth.signUp({
      email, password: pw,
      options: { data: { name, role: 'athlete' } }
    })
    if (error) setErr(error.message)
    else setMsg('Check your email to confirm your account.')
    setLoading(false)
  }

  const resetPassword = async () => {
    if (!email) { setErr('Enter your email first'); return }
    setLoading(true); setErr('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset'
    })
    if (error) setErr(error.message)
    else setMsg('Password reset email sent — check your inbox.')
    setLoading(false)
  }

  const submit = () => mode === 'login' ? login() : register()

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={logo} alt="Sacred Rebellion Barbell" />
          <div className="divider" />
          <h1>Sacred Rebellion</h1>
          <p>Barbell</p>
        </div>

        {msg && <p style={{ color: 'var(--moss-light)', fontSize: '13px', marginBottom: '1rem', textAlign: 'center' }}>{msg}</p>}
        {err && <p className="auth-error">{err}</p>}

        {mode === 'register' && (
          <div className="field">
            <label>Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
          </div>
        )}

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>

        {mode !== 'reset' && (
          <div className="field">
            <label>Password</label>
            <input
              type="password" value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          </div>
        )}

        {mode === 'login' && (
          <p style={{ fontSize: '11px', color: 'var(--charcoal-light)', textAlign: 'right', marginBottom: '1rem', cursor: 'pointer' }}
            onClick={() => { setMode('reset'); setErr(''); setMsg('') }}>
            Forgot password?
          </p>
        )}

        {mode === 'reset'
          ? <button className="btn-primary" onClick={resetPassword} disabled={loading}>Send Reset Email</button>
          : <button className="btn-primary" onClick={submit} disabled={loading}>
              {loading ? 'Loading...' : mode === 'login' ? 'Enter the Rebellion' : 'Create Account'}
            </button>
        }

        <div className="auth-toggle">
          {mode === 'login' && <>New member? <span onClick={() => { setMode('register'); setErr(''); setMsg('') }}>Create account</span></>}
          {mode === 'register' && <>Already a member? <span onClick={() => { setMode('login'); setErr(''); setMsg('') }}>Sign in</span></>}
          {mode === 'reset' && <>Back to <span onClick={() => { setMode('login'); setErr(''); setMsg('') }}>Sign in</span></>}
        </div>
      </div>
    </div>
  )
}
