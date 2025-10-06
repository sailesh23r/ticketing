import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  const body = await req.json().catch(() => null)
  if (!body?.subscription) return new NextResponse('Bad Request', { status: 400 })

  const sub = body.subscription

  // Persist to a local file for development convenience (always, regardless of other env vars)
  try {
    const dataDir = path.join(process.cwd(), '.data')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    const file = path.join(dataDir, 'subscriptions.json')
    let arr: Array<Record<string, unknown>> = []
    if (fs.existsSync(file)) {
      try { arr = JSON.parse(fs.readFileSync(file, 'utf8') || '[]') as Array<Record<string, unknown>> } catch { arr = [] }
    }
    // Deduplicate by subscription.endpoint (safe access)
    const exists = arr.find((r) => {
      const s = r?.subscription as Record<string, unknown> | undefined
      return s && typeof s.endpoint === 'string' && typeof sub?.endpoint === 'string' && s.endpoint === sub.endpoint
    })
    if (!exists) {
      arr.push({ userId: session?.user?.id ?? 'anonymous', subscription: sub, createdAt: Date.now() })
      fs.writeFileSync(file, JSON.stringify(arr, null, 2))
      return NextResponse.json({ ok: true, stored: 'local', added: true })
    }
    return NextResponse.json({ ok: true, stored: 'local', added: false })
  } catch {
    return new NextResponse('Failed to save', { status: 500 })
  }
}
