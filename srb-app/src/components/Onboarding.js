import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import WaiverForm from './WaiverForm'
import MemberAgreement from './MemberAgreement'

const STRIPE_TABLE_ID = process.env.REACT_APP_STRIPE_PRICING_TABLE_ID
const STRIPE_TABLE_ID_2 = process.env.REACT_APP_STRIPE_PRICING_TABLE_ID_2
const STRIPE_PK = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY

const STEPS = [
  { id: 'waiver', title: 'Liability Waiver', description: 'Read and sign the SRB liability waiver', icon: '📋' },
  { id: 'agreement', title: 'Member Agreement', description: 'Read and sign the member agreement', icon: '🤝' },
  { id: 'subscription', title: 'Choose Membership', description: 'Select and set up your membership', icon: '💳' },
  { id: 'profile', title: 'Complete Your Profile', description: 'Add your name and contact info', icon: '👤' },
  { id: 'tutorial', title: 'Get Oriented', description: 'A quick tour of your app', icon: '🗺️' },
]

const TUTORIAL_SLIDES = [
  {
    icon: '🏋️',
    title: 'Workouts',
    body: 'Your daily programming lives here. Browse workouts by date, log your weights set by set, and see how you stack up on the leaderboard. Tap any movement to see a demo video if your coach added one.'
  },
  {
    icon: '📅',
    title: 'Schedule',
    body: 'Sign up for classes, view upcoming sessions, and check in for 24/7 open gym access. You need an active membership to sign up — class access is required for scheduled classes.'
  },
  {
    icon: '📂',
    title: 'Programs',
    body: 'Your coach may assign you a personal program here — date-free workouts you complete at your own pace. Log each workout when you finish it and track your progress.'
  },
  {
    icon: '🛍️',
    title: 'Shop',
    body: 'Rep the rebellion. SRB apparel and gear available in the shop tab. Tap Shop Now to browse the full collection.'
  },
  {
    icon: '👤',
    title: 'Profile',
    body: 'View your estimated 1RMs, attendance history, membership details, and documents. Your 1RMs are calculated automatically from logged strength work.'
  },
  {
    icon: '💪',
    title: "You're In.",
    body: "Strength is ritual. Rebellion is sacred. Welcome to Sacred Rebellion Barbell. Your coach will be in touch — if you have any questions, reach out directly. Now go train."
  }
]

export default function Onboarding({ user, profile, onComplete }) {
  const [activeStep, setActiveStep] = useState(null)
  const [tutorialSlide, setTutorialSlide] = useState(0)
  const [profileName, setProfileName] = useState(profile?.name || '')
  const [profilePhone, setProfilePhone] = useState(profile?.phone || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [currentProfile, setCurrentProfile] = useState(profile)
  const [checking, setChecking] = useState(false)

  // Poll for membership assignment after Stripe checkout
  useEffect(() => {
    if (activeStep !== 'subscription') return
    const interval = setInterval(async () => {
      const { data } = await supabase.from('profiles').select('membership_type, active_products').eq('id', user.id).single()
      if (data?.membership_type && data.membership_type !== 'None') {
        setCurrentProfile(prev => ({ ...prev, ...data }))
        setActiveStep(null)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [activeStep, user.id])

  const getStepStatus = (stepId) => {
    switch (stepId) {
      case 'waiver': return currentProfile?.waiver_signed ? 'complete' : 'pending'
      case 'agreement': return currentProfile?.member_agreement_signed ? 'complete' : 'pending'
      case 'subscription': return (currentProfile?.membership_type && currentProfile.membership_type !== 'None') ? 'complete' : 'pending'
      case 'profile': return (currentProfile?.name && currentProfile?.phone) ? 'complete' : 'pending'
      case 'tutorial': return 'pending'
      default: return 'pending'
    }
  }

  const allComplete = STEPS.slice(0, 4).every(s => getStepStatus(s.id) === 'complete')

  const saveProfile = async () => {
    if (!profileName.trim() || !profilePhone.trim()) return
    setSavingProfile(true)
    await supabase.from('profiles').update({ name: profileName.trim(), phone: profilePhone.trim() }).eq('id', user.id)
    setCurrentProfile(prev => ({ ...prev, name: profileName.trim(), phone: profilePhone.trim() }))
    setSavingProfile(false)
    setActiveStep(null)
  }

  const handleStepClick = (stepId) => {
    if (activeStep === stepId) { setActiveStep(null); return }
    // Can only access steps in order
    const stepIndex = STEPS.findIndex(s => s.id === stepId)
    const allPriorComplete = STEPS.slice(0, stepIndex).every(s => getStepStatus(s.id) === 'complete')
    if (!allPriorComplete) return
    setActiveStep(stepId)
  }

  if (activeStep === 'tutorial') {
    return (
      <div className="app">
        <div style={{ padding: '2rem 1.5rem', maxWidth: '520px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>{TUTORIAL_SLIDES[tutorialSlide].icon}</div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '22px', color: 'var(--gold-light)', marginBottom: '1rem' }}>
              {TUTORIAL_SLIDES[tutorialSlide].title}
            </div>
            <div style={{ width: '40px', height: '1px', background: 'var(--gold)', margin: '0 auto 1.5rem', opacity: 0.5 }} />
            <p style={{ fontSize: '15px', color: 'var(--bone)', lineHeight: 1.8, maxWidth: '400px', margin: '0 auto' }}>
              {TUTORIAL_SLIDES[tutorialSlide].body}
            </p>
          </div>

          {/* Progress dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '2rem' }}>
            {TUTORIAL_SLIDES.map((_, i) => (
              <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === tutorialSlide ? 'var(--gold)' : 'var(--border)', transition: 'background 0.2s' }} />
            ))}
          </div>

          {tutorialSlide < TUTORIAL_SLIDES.length - 1
            ? <button className="btn-primary" onClick={() => setTutorialSlide(t => t + 1)}>Next →</button>
            : <button className="btn-primary" onClick={onComplete}>Enter Sacred Rebellion Barbell</button>
          }
          {tutorialSlide > 0 && (
            <button className="btn-ghost" onClick={() => setTutorialSlide(t => t - 1)} style={{ marginTop: '10px' }}>← Back</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div style={{ padding: '2rem 1.5rem', maxWidth: '600px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '22px', color: 'var(--gold-light)', letterSpacing: '3px', marginBottom: '0.5rem' }}>
            Sacred Rebellion Barbell
          </div>
          <div style={{ fontSize: '12px', letterSpacing: '3px', color: 'var(--rose)', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Welcome
          </div>
          <div style={{ width: '40px', height: '1px', background: 'var(--gold)', margin: '0 auto 1rem', opacity: 0.5 }} />
          <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', lineHeight: 1.7 }}>
            Before you get access to the app, complete the steps below. You can do them in any order, but all are required.
          </p>
        </div>

        {/* Step list */}
        {STEPS.map((step, idx) => {
          const status = getStepStatus(step.id)
          const isActive = activeStep === step.id
          const stepIndex = STEPS.findIndex(s => s.id === step.id)
          const allPriorComplete = STEPS.slice(0, stepIndex).every(s => getStepStatus(s.id) === 'complete')
          const isLocked = !allPriorComplete && status !== 'complete'

          return (
            <div key={step.id} style={{ marginBottom: '10px' }}>
              <div
                onClick={() => !isLocked && handleStepClick(step.id)}
                style={{
                  background: status === 'complete' ? 'rgba(107,115,85,0.15)' : isActive ? 'rgba(200,169,106,0.08)' : 'rgba(245,240,232,0.03)',
                  border: `1px solid ${status === 'complete' ? 'var(--moss)' : isActive ? 'var(--gold-dark)' : 'var(--border)'}`,
                  borderRadius: '4px', padding: '1rem 1.25rem',
                  cursor: isLocked ? 'default' : 'pointer',
                  opacity: isLocked ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: '14px',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '24px', flexShrink: 0 }}>{status === 'complete' ? '✓' : step.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: status === 'complete' ? 'var(--moss-light)' : 'var(--gold-light)', marginBottom: '2px' }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>{step.description}</div>
                </div>
                {!isLocked && <span style={{ color: 'var(--charcoal-light)', fontSize: '16px' }}>{isActive ? '▼' : '›'}</span>}
                {isLocked && <span style={{ color: 'var(--charcoal-light)', fontSize: '14px' }}>🔒</span>}
              </div>

              {/* Step content */}
              {isActive && (
                <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '1.5rem', background: 'rgba(245,240,232,0.02)' }}>

                  {step.id === 'waiver' && (
                    <WaiverForm user={user} profile={currentProfile}
                      onSigned={() => { setCurrentProfile(prev => ({ ...prev, waiver_signed: true })); setActiveStep(null) }} />
                  )}

                  {step.id === 'agreement' && (
                    <MemberAgreement user={user} profile={currentProfile}
                      onSigned={() => { setCurrentProfile(prev => ({ ...prev, member_agreement_signed: true })); setActiveStep(null) }} />
                  )}

                  {step.id === 'subscription' && (
                    <div>
                      <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', marginBottom: '1.5rem', lineHeight: 1.7 }}>
                        Choose your membership below. After completing checkout your membership will be activated automatically — this page will advance on its own.
                      </p>
                      {checking && (
                        <div style={{ fontSize: '13px', color: 'var(--gold-light)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>⏳</span> Waiting for payment confirmation...
                        </div>
                      )}
                      <div style={{ marginBottom: '1rem' }}>
                        <stripe-pricing-table pricing-table-id={STRIPE_TABLE_ID} publishable-key={STRIPE_PK} customer-email={user.email} />
                      </div>
                      {STRIPE_TABLE_ID_2 && (
                        <div>
                          <stripe-pricing-table pricing-table-id={STRIPE_TABLE_ID_2} publishable-key={STRIPE_PK} customer-email={user.email} />
                        </div>
                      )}
                      <button className="btn-ghost" style={{ fontSize: '11px', marginTop: '1rem' }}
                        onClick={async () => {
                          setChecking(true)
                          const { data } = await supabase.from('profiles').select('membership_type, active_products').eq('id', user.id).single()
                          if (data?.membership_type && data.membership_type !== 'None') {
                            setCurrentProfile(prev => ({ ...prev, ...data }))
                            setActiveStep(null)
                          }
                          setChecking(false)
                        }}>
                        Already subscribed? Click to check →
                      </button>
                    </div>
                  )}

                  {step.id === 'profile' && (
                    <div>
                      <div className="field">
                        <label>Full Name</label>
                        <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="First and Last Name" />
                      </div>
                      <div className="field">
                        <label>Phone Number</label>
                        <input type="tel" value={profilePhone} onChange={e => setProfilePhone(e.target.value)} placeholder="(555) 555-5555" />
                      </div>
                      <button className="btn-primary" onClick={saveProfile}
                        disabled={savingProfile || !profileName.trim() || !profilePhone.trim()}>
                        {savingProfile ? 'Saving...' : 'Save Profile'}
                      </button>
                    </div>
                  )}

                </div>
              )}
            </div>
          )
        })}

        {/* Enter app button — shows when steps 1-4 complete */}
        {allComplete && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', color: 'var(--moss-light)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                ✓ All steps complete
              </div>
            </div>
            <button className="btn-primary" onClick={() => setActiveStep('tutorial')}>
              Take the App Tour →
            </button>
            <button className="btn-ghost" onClick={onComplete} style={{ marginTop: '10px', width: '100%', fontSize: '12px' }}>
              Skip tour and enter app
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '11px', color: 'var(--charcoal-light)', fontStyle: 'italic' }}>
          Sacred Rebellion Barbell · Bastrop, Texas · Strength is ritual. Rebellion is sacred.
        </div>
      </div>
    </div>
  )
}
