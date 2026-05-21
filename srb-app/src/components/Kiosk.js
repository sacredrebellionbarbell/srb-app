import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import WaiverForm from './WaiverForm'
import MemberAgreement from './MemberAgreement'

const STRIPE_TABLE_ID = process.env.REACT_APP_STRIPE_PRICING_TABLE_ID
const STRIPE_TABLE_ID_2 = process.env.REACT_APP_STRIPE_PRICING_TABLE_ID_2
const STRIPE_PK = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY
const RESET_TIMEOUT = 90000

const logo = process.env.PUBLIC_URL + '/logo.jpg'

export default function Kiosk() {
  const [step, setStep] = useState('home')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [kioskUser, setKioskUser] = useState(null)
  const [kioskProfile, setKioskProfile] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const resetTimer = useRef(null)
  const countdownTimer = useRef(null)

  const resetKiosk = useCallback(() => {
    clearTimeout(resetTimer.current)
    clearInterval(countdownTimer.current)
    supabase.auth.signOut()
    setStep('home')
    setEmail(''); setPassword(''); setConfirmPassword('')
    setFirstName(''); setLastName(''); setPhone('')
    setErr(''); setLoading(false)
    setKioskUser(null); setKioskProfile(null)
    setCountdown(null)
  }, [])

  const startResetTimer = useCallback(() => {
    clearTimeout(resetTimer.current)
    clearInterval(countdownTimer.current)
    if (step === 'home' || step === 'done') return
    resetTimer.current = setTimeout(() => {
      let secs = 15
      setCountdown(secs)
      countdownTimer.current = setInterval(() => {
        secs -= 1
        setCountdown(secs)
        if (secs <= 0) { clearInterval(countdownTimer.current); resetKiosk() }
      }, 1000)
    }, RESET_TIMEOUT)
  }, [step, resetKiosk])

  useEffect(() => {
    const reset = () => { setCountdown(null); clearTimeout(resetTimer.current); clearInterval(countdownTimer.current); startResetTimer() }
    window.addEventListener('touchstart', reset)
    window.addEventListener('mousedown', reset)
    window.addEventListener('keydown', reset)
    return () => { window.removeEventListener('touchstart', reset); window.removeEventListener('mousedown', reset); window.removeEventListener('keydown', reset) }
  }, [startResetTimer])

  useEffect(() => { startResetTimer() }, [step, startResetTimer])
  useEffect(() => () => { clearTimeout(resetTimer.current); clearInterval(countdownTimer.current) }, [])

  const register = async () => {
    setErr('')
    if (!firstName.trim() || !lastName.trim()) { setErr('Please enter your full name'); return }
    if (!email.trim()) { setErr('Email is required'); return }
    if (!phone.trim()) { setErr('Phone number is required'); return }
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (password !== confirmPassword) { setErr('Passwords do not match'); return }
    setLoading(true)
    const fullName = `${firstName.trim()} ${lastName.trim()}`
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(), password,
      options: { data: { name: fullName } }
    })
    if (error) { setErr(error.message); setLoading(false); return }
    if (data?.user) {
      await supabase.from('profiles').upsert({ id: data.user.id, name: fullName, phone: phone.trim(), email: email.trim().toLowerCase(), role: 'athlete' })
      const profile = { id: data.user.id, name: fullName, phone: phone.trim(), email: email.trim().toLowerCase(), role: 'athlete', waiver_signed: false, member_agreement_signed: false }
      setKioskUser(data.user)
      setKioskProfile(profile)
      setStep('waiver')
    }
    setLoading(false)
  }

  if (step === 'home') {
    return (
      <div style={{ minHeight: '100vh', background: '#1a1a18', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 20%, rgba(200,169,106,0.06) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(162,92,107,0.06) 0%, transparent 60%)' }} />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '500px' }}>
          <img src={logo} alt="SRB" style={{ width: '100px', height: '100px', borderRadius: '8px', objectFit: 'cover', marginBottom: '2rem', border: '1px solid rgba(200,169,106,0.3)' }} />
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '32px', color: 'var(--gold-light)', letterSpacing: '6px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Sacred Rebellion</div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: 'var(--gold)', letterSpacing: '4px', marginBottom: '0.5rem' }}>Barbell</div>
          <div style={{ width: '60px', height: '1px', background: 'var(--gold)', margin: '1.5rem auto', opacity: 0.4 }} />
          <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '3rem', fontStyle: 'italic' }}>Strength is ritual. Rebellion is sacred.</div>
          <button onClick={() => setStep('register')}
            style={{ background: 'linear-gradient(135deg, rgba(200,169,106,0.15), rgba(200,169,106,0.05))', border: '1px solid var(--gold)', borderRadius: '4px', color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', fontSize: '18px', letterSpacing: '4px', textTransform: 'uppercase', padding: '20px 48px', cursor: 'pointer', width: '100%', maxWidth: '380px' }}>
            Join The Rebellion
          </button>
          <div style={{ marginTop: '1.5rem', fontSize: '12px', color: 'rgba(245,240,232,0.2)', letterSpacing: '1px' }}>Bastrop, Texas</div>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div style={{ minHeight: '100vh', background: '#1a1a18', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '1.5rem' }}>⚡</div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '28px', color: 'var(--gold-light)', letterSpacing: '4px', marginBottom: '1rem' }}>You're In.</div>
        <div style={{ width: '40px', height: '1px', background: 'var(--gold)', margin: '0 auto 1.5rem', opacity: 0.5 }} />
        <p style={{ fontSize: '15px', color: 'var(--bone)', lineHeight: 1.8, maxWidth: '400px', marginBottom: '2rem' }}>
          Welcome to Sacred Rebellion Barbell, {kioskProfile?.name?.split(' ')[0] || 'Athlete'}. Your account is set up. Visit sacredrebellion.fit to log in and access your programming.
        </p>
        <p style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginBottom: '2rem' }}>Strength is ritual. Rebellion is sacred.</p>
        <button className="btn-ghost" onClick={resetKiosk} style={{ fontSize: '13px' }}>← Return to Start</button>
        <AutoReset seconds={15} onReset={resetKiosk} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a18', padding: '2rem 1.5rem', position: 'relative' }}>
      {countdown !== null && (
        <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(162,92,107,0.9)', border: '1px solid var(--rose)', borderRadius: '8px', padding: '1rem 2rem', zIndex: 1000, textAlign: 'center' }}>
          <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--bone)', fontSize: '14px' }}>Returning to start in {countdown}s</div>
          <button className="btn-ghost" onClick={() => { setCountdown(null); startResetTimer() }} style={{ fontSize: '12px', marginTop: '6px' }}>I'm still here</button>
        </div>
      )}
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
          <button onClick={resetKiosk} style={{ background: 'none', border: 'none', color: 'var(--charcoal-light)', cursor: 'pointer', fontSize: '20px', padding: '4px' }}>←</button>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: 'var(--gold-light)', letterSpacing: '3px', textTransform: 'uppercase' }}>
            {step === 'register' && 'Create Account'}
            {step === 'waiver' && 'Liability Waiver'}
            {step === 'agreement' && 'Member Agreement'}
            {step === 'subscription' && 'Choose Membership'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '2rem' }}>
          {['register', 'waiver', 'agreement', 'subscription'].map((s, i) => (
            <div key={s} style={{ flex: 1, height: '3px', borderRadius: '2px', background: ['register', 'waiver', 'agreement', 'subscription'].indexOf(step) >= i ? 'var(--gold)' : 'var(--border)', transition: 'background 0.3s' }} />
          ))}
        </div>

        {step === 'register' && (
          <div>
            {err && <p className="auth-error">{err}</p>}
            <div className="two-col">
              <div className="field"><label>First Name</label><input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" autoComplete="off" /></div>
              <div className="field"><label>Last Name</label><input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" autoComplete="off" /></div>
            </div>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoComplete="off" /></div>
            <div className="field"><label>Phone</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" /></div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></div>
            <div className="field"><label>Confirm Password</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm password" autoComplete="new-password" /></div>
            <button className="btn-primary" onClick={register} disabled={loading} style={{ marginTop: '1rem' }}>
              {loading ? 'Creating Account...' : 'Create Account →'}
            </button>
          </div>
        )}

        {step === 'waiver' && kioskUser && (
          <WaiverForm user={kioskUser} profile={kioskProfile}
            onSigned={() => { setKioskProfile(p => ({ ...p, waiver_signed: true })); setStep('agreement') }} />
        )}

        {step === 'agreement' && kioskUser && (
          <MemberAgreement user={kioskUser} profile={kioskProfile}
            onSigned={() => { setKioskProfile(p => ({ ...p, member_agreement_signed: true })); setStep('subscription') }} />
        )}

        {step === 'subscription' && kioskUser && (
          <div>
            <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', marginBottom: '1.5rem', lineHeight: 1.7 }}>
              Choose your membership below. After completing checkout, tap the button to finish registration.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <stripe-pricing-table pricing-table-id={STRIPE_TABLE_ID} publishable-key={STRIPE_PK} customer-email={kioskUser.email} />
            </div>
            {STRIPE_TABLE_ID_2 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <stripe-pricing-table pricing-table-id={STRIPE_TABLE_ID_2} publishable-key={STRIPE_PK} customer-email={kioskUser.email} />
              </div>
            )}
            <button className="btn-primary" onClick={() => setStep('done')} style={{ marginTop: '1rem' }}>
              I've Completed Checkout →
            </button>
            <button className="btn-ghost" onClick={() => setStep('done')} style={{ marginTop: '10px', width: '100%', fontSize: '11px' }}>
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AutoReset({ seconds, onReset }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      setLeft(l => { if (l <= 1) { clearInterval(interval); onReset(); return 0 } return l - 1 })
    }, 1000)
    return () => clearInterval(interval)
  }, [onReset])
  return <div style={{ marginTop: '1rem', fontSize: '12px', color: 'var(--charcoal-light)' }}>Returning to start in {left}s</div>
}
