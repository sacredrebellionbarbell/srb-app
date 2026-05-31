import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { notifyCoach } from '../utils/notifyCoach'

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']
const logo = process.env.PUBLIC_URL + '/logo.jpg'

export default function SupertotalRegistration() {
  const [step, setStep] = useState('info') // info | waiver | payment | done
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    bodyweight: '', snatchOpener: '', cleanJerkOpener: '',
    squatOpener: '', benchOpener: '', deadliftOpener: '',
    includeShirt: false, shirtSize: ''
  })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [regId, setRegId] = useState(null)
  const [paymentVerified, setPaymentVerified] = useState(false)
  const [polling, setPolling] = useState(false)

  // Waiver state
  const [hasRead, setHasRead] = useState(false)
  const [printedName, setPrintedName] = useState('')
  const [hasSigned, setHasSigned] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const canvasRef = useRef(null)
  const lastPos = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || step !== 'waiver') return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(245,240,232,0.04)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#E8D5A8'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [step])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = e => { e.preventDefault(); setDrawing(true); setHasSigned(true); lastPos.current = getPos(e, canvasRef.current) }
  const draw = e => {
    e.preventDefault()
    if (!drawing) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke()
    lastPos.current = pos
  }
  const endDraw = e => { e.preventDefault(); setDrawing(false); lastPos.current = null }
  const clearSig = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(245,240,232,0.04)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasSigned(false)
  }

  // Poll for payment confirmation after Stripe checkout
  useEffect(() => {
    if (step !== 'payment' || !regId || paymentVerified) return
    setPolling(true)
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('event_registrations')
        .select('payment_status')
        .eq('id', regId)
        .single()
      if (data?.payment_status === 'paid') {
        setPaymentVerified(true)
        setPolling(false)
        clearInterval(interval)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [step, regId, paymentVerified])

  const upd = (f, v) => setFormData(d => ({ ...d, [f]: v }))

  const submitInfo = () => {
    setErr('')
    if (!formData.firstName.trim() || !formData.lastName.trim()) { setErr('Full name is required'); return }
    if (!formData.email.trim()) { setErr('Email is required'); return }
    if (!formData.phone.trim()) { setErr('Phone is required'); return }
    if (!formData.bodyweight) { setErr('Bodyweight is required'); return }
    if (!formData.snatchOpener || !formData.cleanJerkOpener || !formData.squatOpener || !formData.benchOpener || !formData.deadliftOpener) {
      setErr('All opening attempts are required'); return
    }
    if (formData.includeShirt && !formData.shirtSize) { setErr('Please select a shirt size'); return }
    setStep('waiver')
  }

  const submitWaiver = async () => {
    setErr('')
    if (!printedName.trim()) { setErr('Please enter your full name'); return }
    if (!hasSigned) { setErr('Please sign in the signature box'); return }
    if (!hasRead) { setErr('Please confirm you have read the waiver'); return }

    setLoading(true)
    const signatureImage = canvasRef.current.toDataURL('image/png')

    // Save registration to Supabase
    const { data, error } = await supabase.from('event_registrations').insert({
      first_name: formData.firstName.trim(),
      last_name: formData.lastName.trim(),
      email: formData.email.trim().toLowerCase(),
      phone: formData.phone.trim(),
      bodyweight_lbs: parseFloat(formData.bodyweight),
      snatch_opener_lbs: parseFloat(formData.snatchOpener),
      clean_jerk_opener_lbs: parseFloat(formData.cleanJerkOpener),
      squat_opener_lbs: parseFloat(formData.squatOpener),
      bench_opener_lbs: parseFloat(formData.benchOpener),
      deadlift_opener_lbs: parseFloat(formData.deadliftOpener),
      include_shirt: formData.includeShirt,
      shirt_size: formData.includeShirt ? formData.shirtSize : null,
      waiver_signed: true,
      waiver_signature: signatureImage,
      waiver_signed_at: new Date().toISOString(),
      payment_status: 'pending'
    }).select().single()

    if (error) { setErr('Error saving registration: ' + error.message); setLoading(false); return }
    setRegId(data.id)

    await notifyCoach(
      'New Supertotal Registration',
      `${formData.firstName.trim()} ${formData.lastName.trim()} registered for the Supertotal. Payment pending.`
    )

    setLoading(false)
    setStep('payment')
  }

  const confirmPayment = () => setStep('done')

  // Progress bar steps
  const steps = ['info', 'waiver', 'payment']
  const stepIdx = steps.indexOf(step)

  if (step === 'done') {
    return (
      <div style={{ minHeight: '100vh', background: '#1a1a18', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '1.5rem' }}>⚡</div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '26px', color: 'var(--gold-light)', letterSpacing: '4px', marginBottom: '1rem' }}>You're Registered.</div>
        <div style={{ width: '40px', height: '1px', background: 'var(--gold)', margin: '0 auto 1.5rem', opacity: 0.5 }} />
        <p style={{ fontSize: '15px', color: 'var(--bone)', lineHeight: 1.8, maxWidth: '440px', marginBottom: '1rem' }}>
          Welcome to the SRB Supertotal, {formData.firstName}. A confirmation email is on its way to {formData.email}.
        </p>
        <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', lineHeight: 1.7, maxWidth: '440px', marginBottom: '2rem' }}>
          <strong style={{ color: 'var(--gold-light)' }}>Saturday, July 11th</strong><br />
          Athlete Check-In: 9:00 AM · Competition Start: 10:00 AM<br />
          117 TX-150 Loop, Suite B200, Bastrop TX
        </p>
        {formData.includeShirt && (
          <div style={{ background: 'rgba(200,169,106,0.08)', border: '1px solid var(--gold-dark)', borderRadius: '4px', padding: '10px 20px', marginBottom: '2rem', fontSize: '13px', color: 'var(--bone)' }}>
            👕 Shirt size {formData.shirtSize} is on order — it'll be ready for pickup at the event.
          </div>
        )}
        <p style={{ fontSize: '13px', color: 'var(--charcoal-light)', fontStyle: 'italic' }}>Strength is ritual. Rebellion is sacred.</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a18', padding: '0', position: 'relative' }}>
      {/* Hero header */}
      <div style={{ background: 'linear-gradient(180deg, rgba(200,169,106,0.08) 0%, transparent 100%)', borderBottom: '1px solid var(--border)', padding: '2rem 1.5rem 1.5rem', textAlign: 'center' }}>
        <img src={logo} alt="SRB" style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover', marginBottom: '1rem', border: '1px solid rgba(200,169,106,0.3)' }} />
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '4px', color: 'var(--rose)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Sacred Rebellion Barbell Presents</div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '32px', color: 'var(--gold-light)', letterSpacing: '6px', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Supertotal</div>
        <div style={{ fontSize: '12px', letterSpacing: '3px', color: 'var(--charcoal-light)', textTransform: 'uppercase', marginBottom: '1rem' }}>One Day. Five Lifts. Total Strength.</div>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap', fontSize: '13px', color: 'var(--bone)' }}>
          <span>📅 Saturday, July 11th</span>
          <span>⏰ 10:00 AM</span>
          <span>📍 117 TX-150 Loop, Suite B200</span>
        </div>
      </div>

      {/* Progress bar */}
      {step !== 'done' && (
        <div style={{ display: 'flex', gap: '4px', padding: '1rem 1.5rem 0' }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= stepIdx ? 'var(--gold)' : 'var(--border)', transition: 'background 0.3s' }} />
          ))}
        </div>
      )}

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.5rem' }}>

        {/* Step 1 — Info */}
        {step === 'info' && (
          <div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: 'var(--gold-light)', letterSpacing: '2px', marginBottom: '1.5rem' }}>Athlete Information</div>
            {err && <p className="auth-error">{err}</p>}

            <div className="two-col">
              <div className="field"><label>First Name</label><input type="text" value={formData.firstName} onChange={e => upd('firstName', e.target.value)} placeholder="First name" /></div>
              <div className="field"><label>Last Name</label><input type="text" value={formData.lastName} onChange={e => upd('lastName', e.target.value)} placeholder="Last name" /></div>
            </div>
            <div className="field"><label>Email</label><input type="email" value={formData.email} onChange={e => upd('email', e.target.value)} placeholder="your@email.com" /></div>
            <div className="field"><label>Phone</label><input type="tel" value={formData.phone} onChange={e => upd('phone', e.target.value)} placeholder="(555) 555-5555" /></div>
            <div className="field"><label>Bodyweight (lbs)</label><input type="number" value={formData.bodyweight} onChange={e => upd('bodyweight', e.target.value)} placeholder="e.g. 165" /></div>

            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: 'var(--gold)', letterSpacing: '2px', margin: '1.5rem 0 1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>Opening Attempts (lbs)</div>
            <div className="two-col">
              <div className="field"><label>Snatch</label><input type="number" value={formData.snatchOpener} onChange={e => upd('snatchOpener', e.target.value)} placeholder="lbs" /></div>
              <div className="field"><label>Clean & Jerk</label><input type="number" value={formData.cleanJerkOpener} onChange={e => upd('cleanJerkOpener', e.target.value)} placeholder="lbs" /></div>
            </div>
            <div className="two-col">
              <div className="field"><label>Back Squat</label><input type="number" value={formData.squatOpener} onChange={e => upd('squatOpener', e.target.value)} placeholder="lbs" /></div>
              <div className="field"><label>Bench Press</label><input type="number" value={formData.benchOpener} onChange={e => upd('benchOpener', e.target.value)} placeholder="lbs" /></div>
            </div>
            <div className="field"><label>Deadlift</label><input type="number" value={formData.deadliftOpener} onChange={e => upd('deadliftOpener', e.target.value)} placeholder="lbs" /></div>

            {/* Shirt option */}
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: 'var(--gold)', letterSpacing: '2px', marginBottom: '1rem' }}>Event Entry</div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                <button
                  onClick={() => upd('includeShirt', false)}
                  className={!formData.includeShirt ? 'btn-sm' : 'btn-ghost'}
                  style={{ flex: 1 }}>
                  Entry Only — $45
                </button>
                <button
                  onClick={() => upd('includeShirt', true)}
                  className={formData.includeShirt ? 'btn-sm' : 'btn-ghost'}
                  style={{ flex: 1 }}>
                  Entry + Shirt — $75
                </button>
              </div>
              {formData.includeShirt && (
                <div className="field">
                  <label>Shirt Size (Unisex)</label>
                  <select value={formData.shirtSize} onChange={e => upd('shirtSize', e.target.value)}>
                    <option value="">Select size...</option>
                    {SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginTop: '6px' }}>
                    Shirts are pre-order only — will be ready for pickup at the event.
                  </div>
                </div>
              )}
            </div>

            <button className="btn-primary" onClick={submitInfo} style={{ marginTop: '1.5rem' }}>
              Continue to Waiver →
            </button>
          </div>
        )}

        {/* Step 2 — Waiver */}
        {step === 'waiver' && (
          <div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: 'var(--gold-light)', letterSpacing: '2px', marginBottom: '1.5rem' }}>Liability Waiver</div>
            {err && <p className="auth-error">{err}</p>}

            <div style={{ background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1.25rem', marginBottom: '1.5rem', maxHeight: '50vh', overflowY: 'auto', fontSize: '13px', color: 'var(--bone)', lineHeight: 1.8 }}>
              <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>1. Parties</p>
              <p style={{ marginBottom: '1rem' }}>This Liability Waiver, Release, and Assumption of Risk Agreement is entered into between Sacred Rebellion Barbell, LLC, a Texas limited liability company, including its owners, members, managers, coaches, contractors, employees, volunteers, agents, landlords, and affiliates (collectively, "SRB"), and the undersigned participant ("Athlete").</p>
              <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>2. Acknowledgment and Assumption of Risk</p>
              <p style={{ marginBottom: '1rem' }}>Athlete acknowledges that participation in the SRB Supertotal competition and related activities, including Olympic weightlifting, powerlifting, and barbell training, involves inherent and unpredictable risks including strains, sprains, fractures, dislocations, concussions, spinal and joint injuries, cardiovascular events, dropped or falling equipment, equipment failure, slips and falls, and aggravation of pre-existing conditions. Athlete voluntarily and knowingly assumes all such risks, whether known or unknown, foreseeable or unforeseeable.</p>
              <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>3. Representations Regarding Health</p>
              <p style={{ marginBottom: '1rem' }}>Athlete represents that they are physically capable of participating and have no medical condition that would prevent safe participation. Athlete agrees to inform SRB staff of any condition, injury, or medication that may affect their participation and to immediately stop any activity that causes pain or distress.</p>
              <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>4. Release, Waiver, and Covenant Not to Sue</p>
              <p style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>EXPRESS NEGLIGENCE NOTICE:</p>
              <p style={{ marginBottom: '1rem' }}>Athlete hereby RELEASES, WAIVES, DISCHARGES, and COVENANTS NOT TO SUE SRB from any and all liability, claims, demands, actions, or causes of action arising out of or related to any loss, damage, or injury, including death, sustained while participating in the SRB Supertotal, <strong>INCLUDING ANY SUCH LIABILITY CAUSED IN WHOLE OR IN PART BY THE NEGLIGENCE OF SRB.</strong> This release does not extend to claims arising from SRB's gross negligence, willful misconduct, or intentional acts.</p>
              <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>5. Indemnification</p>
              <p style={{ marginBottom: '1rem' }}>Athlete agrees to indemnify, defend, and hold harmless SRB from any and all claims, demands, losses, costs, damages, or expenses arising from Athlete's participation.</p>
              <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>6. Emergency Medical Treatment</p>
              <p style={{ marginBottom: '1rem' }}>Athlete authorizes SRB to call emergency services and consent to emergency treatment as deemed advisable by medical personnel. Athlete is responsible for all medical costs.</p>
              <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>7. Governing Law</p>
              <p style={{ marginBottom: '1rem' }}>This Agreement is governed by the laws of the State of Texas. Any dispute shall be resolved exclusively in Bastrop County, Texas.</p>
              <p style={{ fontWeight: 'bold', color: 'var(--gold-light)', lineHeight: 1.7 }}>I HAVE READ THIS AGREEMENT IN ITS ENTIRETY. I UNDERSTAND THAT I AM GIVING UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE SRB FOR NEGLIGENCE. I SIGN THIS AGREEMENT FREELY AND VOLUNTARILY.</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px' }}>
              <input type="checkbox" id="hasReadEvent" checked={hasRead} onChange={e => setHasRead(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--gold)' }} />
              <label htmlFor="hasReadEvent" style={{ fontSize: '14px', color: 'var(--bone)', cursor: 'pointer', lineHeight: 1.5 }}>
                I have read and understand this agreement in its entirety.
              </label>
            </div>

            <div className="field">
              <label>Full Legal Name (Print)</label>
              <input type="text" value={printedName} onChange={e => setPrintedName(e.target.value)} placeholder="First and Last Name" />
            </div>

            <div className="field">
              <label>Signature — Draw your signature below</label>
              <div style={{ position: 'relative', border: '1px solid var(--gold-dark)', borderRadius: '2px', background: 'rgba(245,240,232,0.04)', touchAction: 'none' }}>
                <canvas ref={canvasRef} width={560} height={140}
                  style={{ width: '100%', height: '140px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
                {!hasSigned && (
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--charcoal-light)', fontSize: '13px', pointerEvents: 'none' }}>Sign here</div>
                )}
              </div>
              {hasSigned && <button onClick={clearSig} className="btn-ghost" style={{ fontSize: '11px', marginTop: '6px' }}>Clear Signature</button>}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
              <button className="btn-primary" onClick={submitWaiver} disabled={loading}>
                {loading ? 'Saving...' : 'Continue to Payment →'}
              </button>
              <button className="btn-ghost" onClick={() => setStep('info')} style={{ flex: 'none', width: 'auto', padding: '10px 20px' }}>← Back</button>
            </div>
          </div>
        )}

        {/* Step 3 — Payment */}
        {step === 'payment' && (
          <div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: 'var(--gold-light)', letterSpacing: '2px', marginBottom: '1.5rem' }}>Complete Payment</div>

            <div style={{ background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', color: 'var(--gold-light)', marginBottom: '1rem' }}>Order Summary</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--bone)', marginBottom: '6px' }}>
                <span>{formData.includeShirt ? 'Entry + Event Shirt (Pre-order)' : 'Entry Only'}</span>
                <span style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)' }}>{formData.includeShirt ? '$75' : '$45'}</span>
              </div>
              {formData.includeShirt && (
                <div style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>Shirt size: {formData.shirtSize}</div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontFamily: 'Cinzel, serif', color: 'var(--gold-light)', fontSize: '16px' }}>
                <span>Total</span>
                <span>{formData.includeShirt ? '$75' : '$45'}</span>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <button
                onClick={() => {
                  const url = formData.includeShirt
                    ? `https://buy.stripe.com/dRmeV56jNaVxa3sfiHgw000?prefilled_email=${encodeURIComponent(formData.email)}`
                    : `https://buy.stripe.com/7sYdR17nR0gTa3sdazgw001?prefilled_email=${encodeURIComponent(formData.email)}`
                  window.open(url, '_blank')
                }}
                style={{ display: 'block', width: '100%', background: 'linear-gradient(135deg, rgba(200,169,106,0.2), rgba(200,169,106,0.08))', border: '1px solid var(--gold)', borderRadius: '4px', color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', fontSize: '16px', letterSpacing: '3px', textTransform: 'uppercase', padding: '18px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: '12px' }}>
                Pay {formData.includeShirt ? '$75' : '$45'} →
              </button>
              <p style={{ fontSize: '12px', color: 'var(--charcoal-light)', textAlign: 'center', margin: 0 }}>
                Secure payment powered by Stripe — opens in a new tab
              </p>
            </div>

            {polling && !paymentVerified && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', background: 'rgba(200,169,106,0.06)', border: '1px solid var(--gold-dark)', borderRadius: '4px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '18px' }}>⏳</span>
                <div>
                  <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)', fontSize: '13px' }}>Waiting for payment...</div>
                  <div style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>Complete payment above, this will update automatically.</div>
                </div>
              </div>
            )}

            {paymentVerified && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', background: 'rgba(107,115,85,0.15)', border: '1px solid var(--moss)', borderRadius: '4px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '18px' }}>✓</span>
                <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--moss-light)', fontSize: '13px' }}>Payment confirmed!</div>
              </div>
            )}

            <button className="btn-primary" onClick={confirmPayment} disabled={!paymentVerified}>
              {paymentVerified ? 'Complete Registration →' : 'Waiting for Payment...'}
            </button>
            <div style={{ fontSize: '11px', color: 'var(--charcoal-light)', marginTop: '8px', textAlign: 'center' }}>
              Having trouble? Email sarah@sacredrebellion.fit
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '2rem', fontSize: '11px', color: 'var(--charcoal-light)', fontStyle: 'italic' }}>
        Sacred Rebellion Barbell · Bastrop, Texas · Strength is ritual. Rebellion is sacred.
      </div>
    </div>
  )
}
