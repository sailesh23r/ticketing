import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  const body = await req.json().catch(() => null)
  if (!body?.subscription) return new NextResponse('Bad Request', { status: 400 })

  const sub = body.subscription
  const userId = session?.user?.id ?? 'anonymous'

  // Store subscription in Convex (primary storage)
  try {
    const result = await convex.mutation(api.storeSubscription.store, {
      userId,
      subscription: sub,
    })
    return NextResponse.json({ ok: true, stored: 'convex', added: result.added })
  } catch (err) {
    console.error('Failed to store subscription in Convex:', err)
    return new NextResponse('Failed to save subscription', { status: 500 })
  }
}
