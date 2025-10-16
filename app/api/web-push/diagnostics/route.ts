import { NextResponse } from 'next/server'

function sanitize(v?: string) {
  return v ? v.split('#')[0].trim() : undefined
}

function short(s?: string) {
  if (!s) return undefined
  const t = s.trim()
  if (t.length <= 10) return t
  return `${t.slice(0, 8)}…${t.slice(-6)}`
}

export async function GET() {
  // Server-side presence checks
  const publicClient = sanitize(process.env.NEXT_PUBLIC_WEBPUSH_VAPID)
  const publicServer = sanitize(process.env.WEBPUSH_VAPID_PUBLIC) || sanitize(process.env.VAPID_PUBLIC_KEY)
  const privateServer = sanitize(process.env.WEBPUSH_VAPID_PRIVATE) || sanitize(process.env.VAPID_PRIVATE_KEY)

  return NextResponse.json({
    ok: true,
    clientPublicKeyPresent: Boolean(publicClient),
    serverPublicKeyPresent: Boolean(publicServer),
    serverPrivateKeyPresent: Boolean(privateServer),
    preview: {
      clientPublicKey: short(publicClient),
      serverPublicKey: short(publicServer),
    }
  })
}
