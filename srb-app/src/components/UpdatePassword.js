import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import logo from '../assets/logo.jpg'

export default function UpdatePassword({ session, onComplete }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)

  const updatePassword = async () => {
    setError('')
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.')
      return
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    await supabase.auth.signOut()
    window.history.replaceState({}, '', '/')
    setComplete(true)
    setLoading(false)
  }

  if (complete) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-logo">
            <img src={logo} alt="Sacred Rebellion Barbell" />
            <div className="divider" />
            <h1>Password Updated</h1>
            <p>Your new password is ready.</p>
          </div>
          <p style={{ color: 'var(--bone)', lineHeight: 1.7, textAlign: 'center', marginBottom: '1.5rem' }}>
            Open Sacred Rebellion from your Home Screen and sign in with your email and new password.
          </p>
          <button className="btn-primary" onClick={onComplete}>Go to Sign In</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={logo} alt="Sacred Rebellion Barbell" />
          <div className="divider" />
          <h1>Choose A New Password</h1>
          <p>Sacred Rebellion Barbell</p>
        </div>

        {!session && (
          <p className="auth-error">
            This reset link is invalid or has expired. Return to Sign In and request a new one.
          </p>
        )}
        {error && <p className="auth-error">{error}</p>}

        <div className="field">
          <label>New Password</label>
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            disabled={!session}
          />
        </div>
        <div className="field">
          <label>Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={event => setConfirmPassword(event.target.value)}
            placeholder="Type it again"
            autoComplete="new-password"
            disabled={!session}
            onKeyDown={event => event.key === 'Enter' && session && updatePassword()}
          />
        </div>

        <button className="btn-primary" onClick={updatePassword} disabled={loading || !session}>
          {loading ? 'Updating...' : 'Set New Password'}
        </button>
        <div className="auth-toggle">
          Back to <span onClick={onComplete}>Sign in</span>
        </div>
      </div>
    </div>
  )
}
