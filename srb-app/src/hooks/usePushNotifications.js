import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export default function usePushNotifications(user) {
  const [permission, setPermission] = useState('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission)
  }, [])

  const subscribe = useCallback(async () => {
    if (!user || !VAPID_PUBLIC_KEY) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    setLoading(true)
    try {
      // Register service worker
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Request permission
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') { setLoading(false); return }

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })

      // Save subscription to Supabase
      const { error } = await supabase.from('push_subscriptions').upsert(
        { user_id: user.id, subscription: sub.toJSON() },
        { onConflict: 'user_id' }
      )
      if (!error) setSubscribed(true)
    } catch (err) {
      console.error('Push subscription error:', err)
    }
    setLoading(false)
  }, [user])

  const unsubscribe = useCallback(async () => {
    if (!user) return
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      if (reg) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
      }
      await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
      setSubscribed(false)
    } catch (err) {
      console.error('Unsubscribe error:', err)
    }
  }, [user])

  // Check existing subscription on load
  useEffect(() => {
    if (!user) return
    supabase.from('push_subscriptions').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setSubscribed(true) })
  }, [user])

  return { permission, subscribed, loading, subscribe, unsubscribe }
}
