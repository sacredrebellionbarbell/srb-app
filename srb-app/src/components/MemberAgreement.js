import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const DOC_VERSION = 2

const MEMBER_AGREEMENT_URL = 'https://docs.google.com/document/d/1b_6y_bXXhGuZyyP5yuqPw-HRlWiOISEewAWOlCdq5I8/edit?usp=sharing'

export default function MemberAgreement({ user, profile, onSigned, readOnly }) {
  const [step, setStep] = useState('read')
  const [printedName, setPrintedName] = useState('')
  const [hasRead, setHasRead] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [hasSigned, setHasSigned] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const canvasRef = useRef(null)
  const lastPos = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || step !== 'sign') return
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

  const submit = async () => {
    if (!printedName.trim()) { setErr('Please enter your full name'); return }
    if (!hasSigned) { setErr('Please sign your name in the signature box'); return }
    setSubmitting(true); setErr('')
    const signatureImage = canvasRef.current.toDataURL('image/png')
    const { error } = await supabase.from('member_agreements').insert({
      athlete_id: user.id, signature: signatureImage,
      printed_name: printedName.trim(), doc_version: DOC_VERSION
    })
    if (error) { setErr('Error saving: ' + error.message); setSubmitting(false); return }
    await supabase.from('profiles').update({ member_agreement_signed: true }).eq('id', user.id)
    setStep('done'); setSubmitting(false)
    if (onSigned) onSigned()
  }

  if (step === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
        <div style={{ fontSize: '36px', marginBottom: '1rem' }}>✓</div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: 'var(--gold-light)', marginBottom: '1rem' }}>Member Agreement Signed</div>
        <div style={{ width: '40px', height: '1px', background: 'var(--gold)', margin: '0 auto 1rem', opacity: 0.5 }} />
        <p style={{ fontSize: '14px', color: 'var(--charcoal-light)' }}>Your signed agreement is on file.</p>
      </div>
    )
  }

  if (step === 'sign') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: 'var(--gold-light)', marginBottom: '1.5rem' }}>Sign Member Agreement</div>
        {err && <p className="auth-error">{err}</p>}
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
        <div className="field">
          <label>Date</label>
          <input type="text" value={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} readOnly style={{ opacity: 0.7 }} />
        </div>
        <div style={{ background: 'rgba(200,169,106,0.06)', border: '1px solid var(--gold-dark)', borderRadius: '4px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '13px', color: 'var(--bone)', lineHeight: 1.7, fontWeight: 'bold' }}>
            I have read and agree to the Sacred Rebellion Barbell Member Agreement. I understand my rights and responsibilities as a member of this cooperative.
          </p>
        </div>
        <button className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Saving...' : 'Sign & Submit'}</button>
        <button className="btn-ghost" onClick={() => setStep('read')} style={{ marginTop: '10px', width: '100%' }}>← Back</button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: 'var(--gold-light)', letterSpacing: '2px', marginBottom: '0.5rem' }}>Sacred Rebellion Barbell</div>
        <div style={{ fontSize: '12px', letterSpacing: '3px', color: 'var(--rose)', textTransform: 'uppercase' }}>Member Agreement</div>
        <div style={{ width: '40px', height: '1px', background: 'var(--gold)', margin: '1rem auto', opacity: 0.5 }} />
      </div>

      <div style={{ background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem', marginBottom: '1.5rem', maxHeight: '55vh', overflowY: 'auto', fontSize: '14px', color: 'var(--bone)', lineHeight: 1.8 }}>
        <p style={{ marginBottom: '1rem' }}>This Member Agreement ("Agreement") is entered into between Sacred Rebellion Barbell, LLC ("SRB") and the undersigned member ("Member").</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>1. Membership</p>
        <p style={{ marginBottom: '1rem' }}>Member agrees to abide by the SRB Co-op Bylaws, this Agreement, and all posted facility rules. Membership is a privilege, not a right, and may be suspended or revoked for cause as described in the Bylaws.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>2. Financial Obligations</p>
        <p style={{ marginBottom: '1rem' }}>Member agrees to pay all dues, fees, and equity contributions as set by the Board. Monthly dues are due on the first of each month. Failure to maintain current dues may result in suspension of membership privileges.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>3. Facility Use</p>
        <p style={{ marginBottom: '1rem' }}>Member agrees to use the facility responsibly, maintain equipment in good condition, clean and return equipment after use, and report any damage, malfunction, safety concern, or unsafe condition immediately.</p>
        <p style={{ marginBottom: '1rem' }}>Member understands that SRB may offer open gym, extended access, and/or unsupervised access. During any unsupervised use, Member is solely responsible for exercising within their abilities, using appropriate safety equipment, using spotters when needed, avoiding movements or loads they cannot perform safely, and contacting emergency services when necessary.</p>
        <p style={{ marginBottom: '1rem' }}>Member may not coach, train, instruct, supervise, or provide paid or unpaid training services to any other person inside SRB without explicit written authorization from SRB.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>4. Facility Access, Guests, and Security</p>
        <p style={{ marginBottom: '1rem' }}>Access credentials, door codes, keys, mobile credentials, and any other method of entry are assigned to the individual Member only and are non-transferable. Member may not share, loan, post, screenshot, forward, or otherwise provide access credentials to any other person.</p>
        <p style={{ marginBottom: '1rem' }}>Member may not allow non-members, guests, former members, friends, family members, visitors, or any unauthorized individual to enter the facility using Member's access credentials. Member may not intentionally or negligently allow another person to follow them into the facility. This includes holding the door open for an unauthorized person, propping the door open, or allowing another person to enter before or after Member without separate authorization.</p>
        <p style={{ marginBottom: '1rem' }}>Member is responsible for ensuring the facility remains secure when entering and leaving. Member must confirm that doors are closed and locked upon departure, must not bypass or disable access controls, and must report lost credentials, suspicious activity, unauthorized access, or security concerns immediately.</p>
        <p style={{ marginBottom: '1rem' }}>Member agrees to respect SRB's posted access hours and closure window, including the 11:00 PM to 4:00 AM closure period or any other access restrictions communicated by SRB. Emergency access by key or other means does not create permission for normal training during closed hours.</p>
        <p style={{ marginBottom: '1rem' }}>Violation of this access policy may result in immediate suspension or termination of membership privileges. Member may be financially responsible for any loss, damage, injury, security expense, rekeying, access system changes, or other costs arising from misuse of their access or unauthorized entry connected to their credentials.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>5. Code of Conduct</p>
        <p style={{ marginBottom: '1rem' }}>Member agrees to treat all athletes, coaches, and staff with respect consistent with SRB's core values of Radical Care, Transparency in Power, and Strength in Community. Harassment, discrimination, or conduct that endangers others will result in immediate suspension pending review.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>6. Liability and Unsupervised Access</p>
        <p style={{ marginBottom: '1rem' }}>This Agreement supplements, and does not replace, the SRB Liability Waiver which Member has separately signed. Member acknowledges that training involves inherent risks and agrees to train within their limits and under appropriate supervision when warranted.</p>
        <p style={{ marginBottom: '1rem' }}>Member understands that SRB may not have a coach, employee, contractor, or representative present during all hours of access. Member accepts responsibility for their own decisions, conduct, exercise selection, loading, use of equipment, and safety during unsupervised training.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>7. Video Surveillance and Facility Monitoring</p>
        <p style={{ marginBottom: '1rem' }}>For the safety and security of members, staff, guests, and the facility, Member acknowledges that portions of SRB may be monitored or recorded by video surveillance where permitted by law. Video surveillance may be used to review safety incidents, unauthorized access, equipment damage, rule violations, facility security, and emergency situations.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>8. Cooperative Participation</p>
        <p style={{ marginBottom: '1rem' }}>Co-op members acknowledge their right and responsibility to participate in the governance of SRB, including attending quarterly meetings, voting on board elections, and contributing to the cooperative's direction and policies.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>9. Governing Law</p>
        <p style={{ marginBottom: '1rem' }}>This Agreement is governed by the laws of the State of Texas. Any disputes shall be resolved in Bastrop County, Texas.</p>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
          <p style={{ fontSize: '12px', color: 'var(--charcoal-light)', fontStyle: 'italic' }}>
            For the full Member Agreement, view the live document:{' '}
            <a href={MEMBER_AGREEMENT_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)' }}>
              Sacred Rebellion Barbell Member Agreement
            </a>
          </p>
        </div>
      </div>

      {!readOnly && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px' }}>
            <input type="checkbox" id="agreedMA" checked={hasRead} onChange={e => setHasRead(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--gold)' }} />
            <label htmlFor="agreedMA" style={{ fontSize: '14px', color: 'var(--bone)', cursor: 'pointer', lineHeight: 1.5 }}>
              I have read and understand the Member Agreement in its entirety.
            </label>
          </div>
          <button className="btn-primary" onClick={() => setStep('sign')} disabled={!hasRead}>
            Proceed to Sign
          </button>
        </>
      )}
    </div>
  )
}
