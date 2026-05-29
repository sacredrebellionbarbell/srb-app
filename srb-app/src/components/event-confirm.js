export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, firstName, includeShirt, shirtSize } = req.body
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'sarah@sacredrebellion.fit'

  if (!apiKey) return res.status(500).json({ error: 'Email not configured' })

  const shirtLine = includeShirt
    ? `<p style="margin:0 0 8px;"><strong>Event Shirt:</strong> Size ${shirtSize} — Pre-ordered, ready for pickup at the event.</p>`
    : ''

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#1a1a18;font-family:'Georgia',serif;color:#F5F0E8;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">

    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-family:'Georgia',serif;font-size:11px;letter-spacing:4px;color:#A25C6B;text-transform:uppercase;margin-bottom:8px;">Sacred Rebellion Barbell</div>
      <div style="font-size:28px;letter-spacing:6px;color:#C8A96A;text-transform:uppercase;margin-bottom:4px;">SUPERTOTAL</div>
      <div style="font-size:11px;letter-spacing:3px;color:#6b6b68;text-transform:uppercase;">Registration Confirmed</div>
      <div style="width:40px;height:1px;background:#C8A96A;margin:16px auto;opacity:0.4;"></div>
    </div>

    <div style="background:rgba(200,169,106,0.06);border:1px solid rgba(200,169,106,0.2);border-radius:4px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 16px;font-size:16px;color:#F5F0E8;">You're in, ${firstName}.</p>
      <p style="margin:0 0 16px;font-size:14px;color:#9a9a96;line-height:1.7;">Your registration for the SRB Supertotal is confirmed. Here's everything you need to know.</p>
    </div>

    <div style="background:rgba(245,240,232,0.03);border:1px solid rgba(245,240,232,0.08);border-radius:4px;padding:24px;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:3px;color:#C8A96A;text-transform:uppercase;margin-bottom:16px;">Event Details</div>
      <p style="margin:0 0 8px;font-size:14px;"><strong style="color:#C8A96A;">Date:</strong> Saturday, July 11th, 2026</p>
      <p style="margin:0 0 8px;font-size:14px;"><strong style="color:#C8A96A;">Athlete Check-In:</strong> 9:00 AM</p>
      <p style="margin:0 0 8px;font-size:14px;"><strong style="color:#C8A96A;">Competition Start:</strong> 10:00 AM</p>
      <p style="margin:0 0 8px;font-size:14px;"><strong style="color:#C8A96A;">Location:</strong> Sacred Rebellion Barbell<br>
        <span style="color:#9a9a96;padding-left:16px;">117 TX-150 Loop, Suite B200<br>
        <span style="padding-left:16px;">Bastrop, TX</span></span>
      </p>
    </div>

    <div style="background:rgba(245,240,232,0.03);border:1px solid rgba(245,240,232,0.08);border-radius:4px;padding:24px;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:3px;color:#C8A96A;text-transform:uppercase;margin-bottom:16px;">The Five Lifts</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${['Snatch', 'Clean & Jerk', 'Back Squat', 'Bench Press', 'Deadlift'].map(lift =>
          `<span style="background:rgba(200,169,106,0.1);border:1px solid rgba(200,169,106,0.2);border-radius:2px;padding:4px 10px;font-size:12px;letter-spacing:1px;color:#C8A96A;">${lift}</span>`
        ).join('')}
      </div>
    </div>

    ${includeShirt ? `
    <div style="background:rgba(245,240,232,0.03);border:1px solid rgba(245,240,232,0.08);border-radius:4px;padding:24px;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:3px;color:#C8A96A;text-transform:uppercase;margin-bottom:12px;">Your Order</div>
      ${shirtLine}
      <p style="margin:8px 0 0;font-size:12px;color:#6b6b68;">Your shirt will be ready for pickup at athlete check-in on July 11th.</p>
    </div>
    ` : ''}

    <div style="background:rgba(162,92,107,0.08);border:1px solid rgba(162,92,107,0.2);border-radius:4px;padding:20px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#F5F0E8;line-height:1.7;">
        <strong>Questions?</strong> Reply to this email or reach out at sarah@sacredrebellion.fit. See you on the platform.
      </p>
    </div>

    <div style="text-align:center;padding-top:24px;border-top:1px solid rgba(245,240,232,0.08);">
      <p style="margin:0;font-size:11px;color:#6b6b68;font-style:italic;letter-spacing:1px;">Strength is ritual. Rebellion is sacred.</p>
      <p style="margin:8px 0 0;font-size:11px;color:#6b6b68;">Sacred Rebellion Barbell · Bastrop, Texas</p>
    </div>

  </div>
</body>
</html>
  `

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: `Sacred Rebellion Barbell <${fromEmail}>`,
        to: [email],
        bcc: [fromEmail],
        subject: `You're Registered — SRB Supertotal, July 11th`,
        html
      })
    })

    const data = await response.json()
    if (!response.ok) return res.status(500).json({ error: data.message || 'Email failed' })
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Email error:', err)
    return res.status(500).json({ error: err.message })
  }
}e
