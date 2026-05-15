import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function WaiverForm({ user, profile, onSigned }) {
  const [step, setStep] = useState('read') // read | sign | done
  const [printedName, setPrintedName] = useState('')
  const [photoConsent, setPhotoConsent] = useState(null) // true | false
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyRelationship, setEmergencyRelationship] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [medicalNotes, setMedicalNotes] = useState('')
  const [hasRead, setHasRead] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  // Signature canvas
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSigned, setHasSigned] = useState(false)
  const lastPos = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
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
    if (e.touches) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e) => {
    e.preventDefault()
    setDrawing(true)
    setHasSigned(true)
    const canvas = canvasRef.current
    lastPos.current = getPos(e, canvas)
  }

  const draw = (e) => {
    e.preventDefault()
    if (!drawing) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
  }

  const endDraw = (e) => {
    e.preventDefault()
    setDrawing(false)
    lastPos.current = null
  }

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
    if (photoConsent === null) { setErr('Please indicate your photo/video consent preference'); return }
    if (!emergencyName.trim()) { setErr('Emergency contact name is required'); return }
    if (!emergencyPhone.trim()) { setErr('Emergency contact phone is required'); return }

    setSubmitting(true); setErr('')

    const canvas = canvasRef.current
    const signatureImage = canvas.toDataURL('image/png')

    const { error } = await supabase.from('waivers').insert({
      athlete_id: user.id,
      signature: signatureImage,
      photo_video_consent: photoConsent,
      emergency_contact_name: emergencyName.trim(),
      emergency_contact_relationship: emergencyRelationship.trim(),
      emergency_contact_phone: emergencyPhone.trim(),
      medical_notes: medicalNotes.trim()
    })

    if (error) { setErr('Error saving waiver: ' + error.message); setSubmitting(false); return }

    // Update profile waiver_signed flag
    await supabase.from('profiles').update({ waiver_signed: true, name: printedName.trim() }).eq('id', user.id)

    setStep('done')
    setSubmitting(false)
    if (onSigned) onSigned()
  }

  if (step === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '40px', marginBottom: '1rem' }}>✓</div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '22px', color: 'var(--gold-light)', marginBottom: '1rem' }}>Waiver Signed</div>
        <div style={{ width: '60px', height: '1px', background: 'var(--gold)', margin: '0 auto 1.5rem', opacity: 0.5 }} />
        <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', maxWidth: '360px', margin: '0 auto' }}>
          Welcome to Sacred Rebellion Barbell. Your waiver is on file. You're cleared to train.
        </p>
      </div>
    )
  }

  if (step === 'sign') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: 'var(--gold-light)', marginBottom: '0.5rem' }}>Sign Waiver</div>
        <div style={{ width: '40px', height: '1px', background: 'var(--gold)', marginBottom: '1.5rem', opacity: 0.5 }} />

        {err && <p className="auth-error">{err}</p>}

        {/* Printed name */}
        <div className="field">
          <label>Full Legal Name (Print)</label>
          <input type="text" value={printedName} onChange={e => setPrintedName(e.target.value)}
            placeholder="First and Last Name" />
        </div>

        {/* Signature pad */}
        <div className="field">
          <label>Signature — Draw your signature below</label>
          <div style={{ position: 'relative', border: '1px solid var(--gold-dark)', borderRadius: '2px', background: 'rgba(245,240,232,0.04)', touchAction: 'none' }}>
            <canvas
              ref={canvasRef}
              width={560}
              height={140}
              style={{ width: '100%', height: '140px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasSigned && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--charcoal-light)', fontSize: '13px', pointerEvents: 'none', letterSpacing: '1px' }}>
                Sign here
              </div>
            )}
          </div>
          {hasSigned && (
            <button onClick={clearSig} className="btn-ghost" style={{ fontSize: '11px', marginTop: '6px' }}>Clear Signature</button>
          )}
        </div>

        {/* Date */}
        <div className="field">
          <label>Date</label>
          <input type="text" value={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} readOnly
            style={{ opacity: 0.7 }} />
        </div>

        {/* Photo/video consent */}
        <div className="field">
          <label>Photo & Video Consent (Section 6)</label>
          <p style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginBottom: '10px' }}>
            SRB requests permission to photograph and video record you for marketing and social media use.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className={photoConsent === true ? 'btn-sm' : 'btn-ghost'} onClick={() => setPhotoConsent(true)}>
              Initial to Consent
            </button>
            <button className={photoConsent === false ? 'btn-sm' : 'btn-ghost'} onClick={() => setPhotoConsent(false)}>
              Initial to Decline
            </button>
          </div>
        </div>

        {/* Emergency contact */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '1rem' }}>Emergency Contact</div>
          <div className="two-col">
            <div className="field"><label>Name</label><input type="text" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} placeholder="Full name" /></div>
            <div className="field"><label>Relationship</label><input type="text" value={emergencyRelationship} onChange={e => setEmergencyRelationship(e.target.value)} placeholder="Spouse, parent, etc." /></div>
          </div>
          <div className="field"><label>Phone</label><input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="(555) 555-5555" /></div>
        </div>

        {/* Medical notes */}
        <div className="field">
          <label>Known Allergies / Medical Conditions / Medications</label>
          <textarea value={medicalNotes} onChange={e => setMedicalNotes(e.target.value)}
            placeholder="List any allergies, conditions, or medications coaches should know about. Write 'None' if not applicable." />
        </div>

        {/* Final acknowledgment */}
        <div style={{ background: 'rgba(200,169,106,0.06)', border: '1px solid var(--gold-dark)', borderRadius: '4px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '13px', color: 'var(--bone)', lineHeight: 1.7, fontWeight: 'bold' }}>
            I HAVE READ THIS AGREEMENT IN ITS ENTIRETY. I UNDERSTAND THAT I AM GIVING UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE SRB FOR NEGLIGENCE. I SIGN THIS AGREEMENT FREELY AND VOLUNTARILY.
          </p>
        </div>

        <button className="btn-primary" onClick={submit} disabled={submitting}>
          {submitting ? 'Saving...' : 'Sign & Submit Waiver'}
        </button>
        <button className="btn-ghost" onClick={() => setStep('read')} style={{ marginTop: '10px', width: '100%' }}>
          ← Back to Waiver
        </button>
      </div>
    )
  }

  // step === 'read'
  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '22px', color: 'var(--gold-light)', letterSpacing: '3px', marginBottom: '0.5rem' }}>Sacred Rebellion Barbell</div>
        <div style={{ fontSize: '13px', letterSpacing: '3px', color: 'var(--rose)', textTransform: 'uppercase' }}>Liability Waiver, Release, and Assumption of Risk</div>
        <div style={{ width: '60px', height: '1px', background: 'var(--gold)', margin: '1rem auto', opacity: 0.5 }} />
        <p style={{ fontSize: '13px', color: 'var(--charcoal-light)', fontWeight: 'bold', letterSpacing: '1px' }}>PLEASE READ CAREFULLY BEFORE SIGNING</p>
      </div>

      <div style={{ background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem', marginBottom: '1.5rem', maxHeight: '55vh', overflowY: 'auto', fontSize: '14px', color: 'var(--bone)', lineHeight: 1.8 }}>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>1. Parties</p>
        <p style={{ marginBottom: '1rem' }}>This Liability Waiver, Release, and Assumption of Risk Agreement ("Agreement") is entered into between Sacred Rebellion Barbell, LLC, a Texas limited liability company, including its owners, members, managers, coaches, independent contractors, employees, volunteers, agents, landlords, and affiliates (collectively, "SRB"), and the undersigned participant ("Athlete"). If the Athlete is under the age of eighteen (18), this Agreement must also be signed by the Athlete's parent or legal guardian.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>2. Acknowledgment and Assumption of Risk</p>
        <p style={{ marginBottom: '1rem' }}>Athlete acknowledges that participation in strength and conditioning activities, including but not limited to Olympic weightlifting, powerlifting, barbell training, kettlebell and dumbbell training, gymnastic and bodyweight movements, plyometrics, metabolic conditioning, mobility work, group classes, private coaching, open gym use, and any other activities offered or conducted on SRB premises (collectively, "Activities"), involves inherent and unpredictable risks of physical injury, illness, permanent disability, and death.</p>
        <p style={{ marginBottom: '1rem' }}>These risks include, but are not limited to: strains, sprains, fractures, dislocations, concussions, spinal and joint injuries, cardiovascular events including heart attack and stroke, dropped or falling equipment, equipment failure, slips and falls, contact with other athletes or coaches, exposure to communicable disease, dehydration, heat illness, rhabdomyolysis, and aggravation of pre-existing conditions.</p>
        <p style={{ marginBottom: '1rem' }}>Athlete has had the opportunity to ask questions about the Activities and SRB's facility, equipment, and programming, and voluntarily and knowingly assumes all such risks, whether known or unknown, foreseeable or unforeseeable.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>3. Representations Regarding Health</p>
        <p style={{ marginBottom: '1rem' }}>Athlete represents that they are physically capable of participating in the Activities and have no medical condition, injury, illness, disability, or other physical or mental impairment that would prevent safe participation. Athlete agrees that SRB has recommended, and Athlete is responsible for obtaining, medical clearance from a licensed physician prior to beginning any exercise program. Athlete agrees to inform their coach of any condition, injury, medication, or circumstance that may affect their participation, and to immediately stop any activity that causes pain or distress.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>4. Release, Waiver, and Covenant Not to Sue</p>
        <p style={{ marginBottom: '0.5rem', fontWeight: 'bold', color: 'var(--gold-light)' }}>EXPRESS NEGLIGENCE NOTICE:</p>
        <p style={{ marginBottom: '1rem' }}>Athlete, on behalf of themselves, their spouse, heirs, executors, administrators, personal representatives, and assigns, hereby RELEASES, WAIVES, DISCHARGES, and COVENANTS NOT TO SUE SRB from any and all liability, claims, demands, actions, or causes of action whatsoever arising out of or related to any loss, damage, or injury, including death, that may be sustained by Athlete while participating in the Activities, while on or about SRB premises, or while using any SRB equipment, <strong>INCLUDING ANY SUCH LIABILITY, CLAIMS, DEMANDS, ACTIONS, OR CAUSES OF ACTION CAUSED IN WHOLE OR IN PART BY THE NEGLIGENCE OF SRB.</strong></p>
        <p style={{ marginBottom: '1rem' }}>This release does not extend to claims arising from SRB's gross negligence, willful misconduct, or intentional acts.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>5. Indemnification</p>
        <p style={{ marginBottom: '1rem' }}>Athlete agrees to indemnify, defend, and hold harmless SRB from any and all claims, demands, losses, costs, damages, or expenses (including reasonable attorneys' fees) arising from or related to Athlete's participation in the Activities, including claims brought by third parties.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>6. Photo, Video, and Likeness Release</p>
        <p style={{ marginBottom: '1rem' }}>Athlete grants SRB the right to photograph, video record, and use Athlete's name, image, voice, and likeness in SRB marketing, social media, and promotional materials, without compensation. Athlete may revoke this consent in writing at any time, effective for future use only.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>7. Emergency Medical Treatment</p>
        <p style={{ marginBottom: '1rem' }}>In the event of injury or medical emergency, Athlete authorizes SRB to call emergency services and consent to such emergency treatment as may be deemed advisable by attending medical personnel. Athlete is responsible for all medical costs.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>8. Facility Rules and Removal</p>
        <p style={{ marginBottom: '1rem' }}>Athlete agrees to follow all posted and verbally communicated facility rules and coach instructions. SRB reserves the right to refuse service, suspend, or remove any person from the premises for conduct that endangers safety, violates SRB's policies, or is inconsistent with SRB's values of radical care, transparency, and community respect.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>9. Governing Law, Severability, and Entire Agreement</p>
        <p style={{ marginBottom: '1rem' }}>This Agreement is governed by the laws of the State of Texas. Any dispute shall be resolved exclusively in the state or federal courts located in Bastrop County, Texas. If any provision of this Agreement is held unenforceable, the remaining provisions shall remain in full force. This Agreement is the entire agreement between the parties regarding its subject matter and supersedes any prior agreements or understandings.</p>

        <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)', marginBottom: '0.75rem' }}>10. Acknowledgment</p>
        <p style={{ fontWeight: 'bold', color: 'var(--gold-light)', lineHeight: 1.7 }}>I HAVE READ THIS AGREEMENT IN ITS ENTIRETY. I UNDERSTAND THAT I AM GIVING UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE SRB FOR NEGLIGENCE. I SIGN THIS AGREEMENT FREELY AND VOLUNTARILY.</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px' }}>
        <input type="checkbox" id="hasRead" checked={hasRead} onChange={e => setHasRead(e.target.checked)}
          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--gold)' }} />
        <label htmlFor="hasRead" style={{ fontSize: '14px', color: 'var(--bone)', cursor: 'pointer', lineHeight: 1.5 }}>
          I have read and understand this entire agreement, including the assumption of risk and release of liability provisions.
        </label>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginBottom: '1.5rem', fontStyle: 'italic' }}>
        Sacred Rebellion Barbell · Bastrop, Texas · Strength is ritual. Rebellion is sacred.
      </div>

      <button className="btn-primary" onClick={() => setStep('sign')} disabled={!hasRead}>
        I Have Read the Waiver — Proceed to Sign
      </button>
    </div>
  )
}
