import React from 'react'
const logo = process.env.PUBLIC_URL + '/logo.jpg'
  export default function Nav({ user, profile, tab, setTab, onLogout }) {
  const initials = (profile?.name || user?.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const isCoach = profile?.role === 'coach'

  return (
    <nav className="nav">
      <div className="nav-brand">
        <img src={logo} alt="SRB" />
        <div className="nav-brand-text">
          SRB
          <span>Sacred Rebellion Barbell</span>
        </div>
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === 'workouts' ? 'active' : ''}`} onClick={() => setTab('workouts')}>Workouts</button>
        <button className={`nav-tab ${tab === 'schedule' ? 'active' : ''}`} onClick={() => setTab('schedule')}>Schedule</button>
        {isCoach && <button className={`nav-tab ${tab === 'post' ? 'active' : ''}`} onClick={() => setTab('post')}>Post</button>}
        {isCoach && <button className={`nav-tab ${tab === 'crm' ? 'active' : ''}`} onClick={() => setTab('crm')}>Members</button>}
        <button className={`nav-tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile</button>
      </div>

      <div className="nav-user">
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" className="nav-avatar" onClick={() => setTab('profile')} />
          : <div className="nav-avatar-placeholder" onClick={() => setTab('profile')}>{initials}</div>
        }
        <button className="btn-ghost" onClick={onLogout}>Sign Out</button>
      </div>
    </nav>
  )
}
