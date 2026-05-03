import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import Nav from './components/Nav'
import Workouts from './components/Workouts'
import PostWorkout from './components/PostWorkout'
import PhotoWorkout from './components/PhotoWorkout'
import Profile from './components/Profile'
import Schedule from './components/Schedule'
import CRM from './components/CRM'
import Programs from './components/Programs'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('workouts')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setTab('workouts')
  }

  if (loading) return (
    <div className="app">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-dark)', letterSpacing: '4px', fontSize: '14px', textTransform: 'uppercase' }}>
          Sacred Rebellion Barbell
        </div>
      </div>
    </div>
  )

  if (!session) return <div className="app"><Auth /></div>

  const isCoach = profile?.role === 'coach'

  return (
    <div className="app">
      <Nav user={session.user} profile={profile} tab={tab} setTab={setTab} onLogout={handleLogout} />
      <main className="main">
        {tab === 'workouts' && <Workouts user={session.user} profile={profile} />}
        {tab === 'schedule' && <Schedule user={session.user} profile={profile} />}
        {tab === 'post' && isCoach && <PostWorkout user={session.user} onPosted={() => setTab('workouts')} />}
        {tab === 'programs' && <Programs user={session.user} profile={profile} />}
        {tab === 'photo' && isCoach && <PhotoWorkout user={session.user} onPosted={() => setTab('workouts')} />}
        {tab === 'crm' && isCoach && <CRM user={session.user} />}
        {tab === 'shop' && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '28px', color: 'var(--gold-light)', letterSpacing: '3px', marginBottom: '1rem' }}>SRB Gear</div>
            <div style={{ width: '60px', height: '1px', background: 'var(--gold)', margin: '0 auto 1.5rem', opacity: 0.5 }} />
            <p style={{ fontSize: '15px', color: 'var(--charcoal-light)', marginBottom: '2rem', lineHeight: 1.7, maxWidth: '400px', margin: '0 auto 2rem' }}>
              Rep the rebellion. Sacred Rebellion Barbell apparel and gear — built for people who take the barbell seriously.
            </p>
            <a
              href="https://sacredrebellionbarbell.printify.me"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', background: 'var(--gold-dark)', border: '1px solid var(--gold)', color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '3px', textTransform: 'uppercase', padding: '14px 32px', textDecoration: 'none', borderRadius: '2px' }}
            >
              Shop Now
            </a>
          </div>
        )}
        {tab === 'profile' && <Profile user={session.user} profile={profile} onProfileUpdate={() => fetchProfile(session.user.id)} />}
      </main>
    </div>
  )
}
