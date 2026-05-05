import React from 'react'

function getYouTubeId(url) {
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function getDemoButtonUrl(url) {
  return getYouTubeId(url) ? url : null
}

export default function VideoModal({ url, title, onClose }) {
  const videoId = getYouTubeId(url)
  if (!videoId) return null

  return (
    <div
      className="modal-wrap"
      onClick={e => { if (e.target.className === 'modal-wrap') onClose() }}
    >
      <div className="modal" style={{ maxWidth: '640px' }}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Demo</div>
            {title && <div className="modal-sub">{title}</div>}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            title={title || 'Exercise Demo'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
