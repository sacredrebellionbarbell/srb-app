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
        {tab === 'post' && isCoach && <PostWorkout onPosted={() => setTab('workouts')} />}
        {tab === 'photo' && isCoach && <PhotoWorkout user={session.user} onPosted={() => setTab('workouts')} />}
        {tab === 'crm' && isCoach && <CRM user={session.user} />}
        {tab === 'profile' && <Profile user={session.user} profile={profile} onProfileUpdate={() => fetchProfile(session.user.id)} />}
      </main>
    </div>
  )
}
