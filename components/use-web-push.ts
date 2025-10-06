// Hook to register browser push subscription and send test push
export async function registerWebPush(vapidPublicKey: string) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Web Push not supported in this browser')
  }

  const registration = await navigator.serviceWorker.register('/sw.js')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permission not granted. Please allow notifications in your browser settings and reload the page.')
  }

  // Convert VAPID key
  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
    return outputArray
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })
    // Persist subscription to server (local dev storage)
    try {
      const res = await fetch('/api/web-push/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() })
      })
      if (!res.ok) {
        // Non-fatal for client, but helpful for debugging
        console.warn('Failed to persist subscription via /api/web-push/register:', await res.text())
      }
    } catch (e) {
      console.warn('Error calling /api/web-push/register', e)
    }

    return subscription
}

export async function sendTestWebPush(body: { title: string; body?: string; url?: string; userIds?: string[] }) {
  const res = await fetch('/api/web-push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('Failed to send test push')
  return res.json()
}
