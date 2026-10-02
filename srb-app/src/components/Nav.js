import React, { useEffect, useRef, useState } from 'react'

const logo = process.env.PUBLIC_URL + '/logo.jpg'

const NAV_ITEMS = [
  { id: 'workouts', label: 'Training', icon: '◉', coachOnly: false },
  { id: 'schedule', label: 'Schedule', icon: '▦', coachOnly: false },
  { id: 'profile', label: 'Profile', icon: '●', coachOnly: false },
  { id: 'programs', label: 'Programs', icon: '📂', coachOnly: false },
  { id: 'resources', label: 'Resources', icon: '🔗', coachOnly: false },
  { id: 'leaderboards', label: 'Leaderboards', icon: '★', coachOnly: false, target: 'workouts' },
  { id: 'shop', label: 'Shop', icon: '🛍️', coachOnly: false },
  { id: 'command', label: 'Command Center', icon: '⌁', coachOnly: true },
  { id: 'planner', label: 'Programming Board', icon: '▦', coachOnly: true },
  { id: 'post', label: 'Post Workout', icon: '✏️', coachOnly: true },
  { id: 'photo', label: 'Upload Photo', icon: '📷', coachOnly: true },
  { id: 'sheet-import', label: 'Import Sheet', icon: '📄', coachOnly: true },
  { id: 'crm', label: 'Members', icon: '👥', coachOnly: true },
]

export default function Nav({ user, profile, tab, setTab, onLogout }) {
  const [open, setOpen] = useState(false)
  const sidebarRef = useRef(null)
  const isCoach = profile?.role === 'coach'
  const initials = (profile?.name || user?.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  // Close sidebar on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (open && sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
    }
  }, [open])

  // Close sidebar on tab change
  const handleTabChange = (id) => {
    const item = NAV_ITEMS.find(navItem => navItem.id === id)
    setTab(item?.target || id)
    setOpen(false)
  }

  const visibleItems = NAV_ITEMS.filter(item => !item.coachOnly || isCoach)
  const currentItem = NAV_ITEMS.find(item => item.id === tab)
  const bottomItems = NAV_ITEMS.filter(item => ['workouts', 'schedule', 'profile'].includes(item.id))

  return (
    <>
      {/* Top header bar */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '56px',
        background: 'rgba(28,28,26,0.97)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1rem',
        backdropFilter: 'blur(8px)'
      }}>
        {/* Hamburger */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center', justifyContent: 'center' }}
          aria-label="Open menu"
        >
          <span style={{ display: 'block', width: '22px', height: '2px', background: open ? 'var(--gold-light)' : 'var(--bone)', borderRadius: '2px', transition: 'all 0.2s', transform: open ? 'rotate(45deg) translate(5px, 5px)' : 'none' }} />
          <span style={{ display: 'block', width: '22px', height: '2px', background: open ? 'transparent' : 'var(--bone)', borderRadius: '2px', transition: 'all 0.2s' }} />
          <span style={{ display: 'block', width: '22px', height: '2px', background: open ? 'var(--gold-light)' : 'var(--bone)', borderRadius: '2px', transition: 'all 0.2s', transform: open ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }} />
        </button>

        {/* Center — current tab name */}
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '14px', letterSpacing: '3px', color: 'var(--gold-light)', textTransform: 'uppercase' }}>
          {currentItem?.label || 'Sacred Rebellion'}
        </div>

        {/* Right — avatar */}
        <div onClick={() => handleTabChange('profile')} style={{ cursor: 'pointer' }}>
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--gold-dark)' }} />
            : <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '12px', color: 'var(--gold-light)', border: '1px solid var(--gold-dark)' }}>{initials}</div>
          }
        </div>
      </header>

      {/* Overlay */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150, backdropFilter: 'blur(2px)' }} />
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 200,
          width: '280px',
          background: '#1a1a18',
          borderRight: '1px solid var(--border)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto'
        }}
      >
        {/* Sidebar header */}
        <div style={{ padding: '1.5rem 1.25rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={logo} alt="SRB" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
          <div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: 'var(--gold-light)', letterSpacing: '2px' }}>SRB</div>
            <div style={{ fontSize: '10px', color: 'var(--charcoal-light)', letterSpacing: '2px', textTransform: 'uppercase' }}>Sacred Rebellion Barbell</div>
          </div>
        </div>

        {/* Profile summary */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--gold-dark)', flexShrink: 0 }} />
            : <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '13px', color: 'var(--gold-light)', flexShrink: 0 }}>{initials}</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', color: 'var(--bone)', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.name || user?.email}</div>
            {profile?.membership_type && (
              <div style={{ fontSize: '11px', color: 'var(--gold-dark)', letterSpacing: '1px', textTransform: 'uppercase' }}>{profile.membership_type}</div>
            )}
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '0.75rem 0' }}>
          {/* Athlete items */}
          <div style={{ padding: '0 0.75rem', marginBottom: '0.5rem' }}>
            {visibleItems.filter(i => !i.coachOnly && !['workouts', 'schedule', 'profile'].includes(i.id)).map(item => (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: tab === item.id ? 'rgba(200,169,106,0.12)' : 'transparent',
                  borderLeft: tab === item.id ? '2px solid var(--gold)' : '2px solid transparent',
                  color: tab === item.id ? 'var(--gold-light)' : 'var(--charcoal-light)',
                  fontFamily: tab === item.id ? 'Cinzel, serif' : 'Lato, sans-serif',
                  fontSize: '14px', letterSpacing: tab === item.id ? '1px' : '0',
                  textAlign: 'left', transition: 'all 0.15s'
                }}
              >
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          {/* Coach-only section */}
          {isCoach && (
            <>
              <div style={{ padding: '0.5rem 1.25rem', fontSize: '10px', letterSpacing: '2px', color: 'var(--charcoal-light)', textTransform: 'uppercase', marginTop: '0.5rem' }}>
                Coach Tools
              </div>
              <div style={{ padding: '0 0.75rem' }}>
                {visibleItems.filter(i => i.coachOnly).map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleTabChange(item.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      background: tab === item.id ? 'rgba(162,92,107,0.12)' : 'transparent',
                      borderLeft: tab === item.id ? '2px solid var(--rose)' : '2px solid transparent',
                      color: tab === item.id ? 'var(--rose-light)' : 'var(--charcoal-light)',
                      fontFamily: tab === item.id ? 'Cinzel, serif' : 'Lato, sans-serif',
                      fontSize: '14px', letterSpacing: tab === item.id ? '1px' : '0',
                      textAlign: 'left', transition: 'all 0.15s'
                    }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* Tagline + Sign out */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '10px', color: 'var(--charcoal-light)', fontStyle: 'italic', marginBottom: '12px', letterSpacing: '1px' }}>
            Strength is ritual. Rebellion is sacred.
          </div>
          <button className="btn-ghost" onClick={onLogout} style={{ width: '100%', fontSize: '12px' }}>
            Sign Out
          </button>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {bottomItems.map(item => (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav-item ${tab === item.id ? 'active' : ''}`}
            onClick={() => handleTabChange(item.id)}
          >
            <span className="bottom-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`bottom-nav-item ${open ? 'active' : ''}`}
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
        >
          <span className="bottom-nav-icon bottom-nav-more" aria-hidden="true">•••</span>
          <span>More</span>
        </button>
      </nav>

      <style>{`
        .bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:140;height:74px;padding:7px max(8px,env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));display:grid;grid-template-columns:repeat(4,1fr);background:rgba(28,28,26,.98);border-top:1px solid var(--border-strong);backdrop-filter:blur(12px)}
        .bottom-nav-item{min-width:0;border:0;background:transparent;color:var(--charcoal-light);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-family:'Lato',sans-serif;font-size:11px;letter-spacing:0;cursor:pointer}
        .bottom-nav-item.active{color:var(--gold-light)}
        .bottom-nav-icon{height:25px;font-size:21px;line-height:25px;font-family:'Cinzel',serif}
        .bottom-nav-more{letter-spacing:2px;font-size:18px}
        .main{padding-bottom:112px!important}
        @media(min-width:821px){.bottom-nav{left:50%;right:auto;transform:translateX(-50%);width:min(620px,100%);border-left:1px solid var(--border);border-right:1px solid var(--border);border-radius:6px 6px 0 0}.bottom-nav-item{font-size:12px}}
      `}</style>

      {/* Spacers so content doesn't hide under fixed navigation */}
      <div style={{ height: '56px' }} />
    </>
  )
}
