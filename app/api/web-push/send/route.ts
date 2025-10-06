import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Lightweight structured logger (suppressed in production unless WEB_PUSH_DEBUG=1)
const DEBUG = process.env.WEB_PUSH_DEBUG === '1' || process.env.NODE_ENV !== 'production'
function log(event: string, meta: Record<string, unknown> = {}) {
  if (!DEBUG) return
  try {
    // Avoid logging secrets
    const sanitized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(meta)) {
      if (k.toLowerCase().includes('private') || k.toLowerCase().includes('secret')) continue
      sanitized[k] = v
    }
    console.log(`[web-push/send] ${new Date().toISOString()} ${event}`, JSON.stringify(sanitized))
  } catch (e) {
    console.log('[web-push/send] log_error', e)
  }
}

function short(s?: string) {
  if (!s) return undefined
  return `${s.slice(0, 8)}…${s.slice(-6)}`
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.title) {
    log('bad_request_missing_title', { bodyKeys: Object.keys(body || {}) })
    return new NextResponse('Bad Request', { status: 400 })
  }
  log('request_received', { hasBody: !!body, title: body.title, userIdsArray: Array.isArray(body.userIds), bodyLength: (body.body || '').length })
  const targetUserIds: string[] | undefined = Array.isArray(body.userIds)
    ? body.userIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
    : undefined

  // Read and sanitize VAPID keys (strip inline comments/whitespace if any)
  const sanitize = (v?: string) => (v ? v.split('#')[0].trim() : undefined)
  const publicKey = sanitize(process.env.WEBPUSH_VAPID_PUBLIC || process.env.VAPID_PUBLIC_KEY)
  const privateKey = sanitize(process.env.WEBPUSH_VAPID_PRIVATE || process.env.VAPID_PRIVATE_KEY)
  if (!publicKey || !privateKey) {
    log('vapid_missing', { publicPresent: !!publicKey, privatePresent: !!privateKey })
    return new NextResponse('VAPID keys not configured', { status: 500 })
  }
  log('vapid_loaded', { publicKey: short(publicKey) })

  try {
  const webpushModule = await import('web-push')
  const webpush = webpushModule.default || webpushModule
  webpush.setVapidDetails('mailto:dev@example.com', publicKey, privateKey)
  log('webpush_configured', {})

    const file = path.join(process.cwd(), '.data', 'subscriptions.json')
    if (!fs.existsSync(file)) {
      log('subscriptions_file_missing', { file })
      return NextResponse.json({ ok: true, sent: 0, note: 'No subscriptions' })
    }
  type Stored = { userId?: string; subscription?: unknown }
  let arr: Stored[] = []
    try {
      const raw = fs.readFileSync(file, 'utf8')
      arr = JSON.parse(raw || '[]') as Stored[]
      log('subscriptions_loaded', { count: arr.length })
    } catch (e) {
      log('subscriptions_parse_error', { error: (e as Error).message })
      arr = []
    }

    // Optionally filter by userIds
    if (targetUserIds && targetUserIds.length > 0) {
      const before = arr.length
      arr = arr.filter((rec) => typeof rec.userId === 'string' && targetUserIds.includes(rec.userId as string))
      log('subscriptions_filtered', { before, after: arr.length, targetUserIdsCount: targetUserIds.length })
    }

    const results: Array<{ endpoint?: string; ok: boolean; status?: number; error?: string; userId?: string }> = []
    const remaining: Array<Record<string, unknown>> = []
    for (const rec of arr) {
      const subscription = rec.subscription as { endpoint?: unknown } | undefined
      const endpoint = subscription && typeof subscription.endpoint === 'string' ? subscription.endpoint : undefined
      try {
  await webpush.sendNotification(rec.subscription as object, JSON.stringify({ title: body.title, body: body.body || '', data: { url: body.url || '/' } }))
        results.push({ endpoint, ok: true, userId: rec.userId as string | undefined })
        log('push_success', { endpoint: short(endpoint), userId: rec.userId })
    // keep valid subscription
    remaining.push(rec)
      } catch (err: unknown) {
        // Get numeric status if present
        let status: number | undefined
        if (err && typeof err === 'object') {
          const maybe = err as Record<string, unknown>
          if (typeof maybe.statusCode === 'number') status = maybe.statusCode
          else if (typeof maybe.status === 'number') status = maybe.status
        }
        // 410 / 404 -> dropped
        if (status === 410 || status === 404) {
          results.push({ endpoint, ok: false, status, error: 'gone', userId: rec.userId as string | undefined })
          log('push_gone', { endpoint: short(endpoint), status, userId: rec.userId })
          continue
        }
        let errMsg = ''
        function getMessage(e: unknown): string | undefined {
          if (!e || typeof e !== 'object') return undefined
          const maybe = e as Record<string, unknown>
          if (typeof maybe.message === 'string') return maybe.message
          return undefined
        }
        errMsg = getMessage(err) ?? String(err)
        results.push({ endpoint, ok: false, status, error: errMsg, userId: rec.userId as string | undefined })
        log('push_error', { endpoint: short(endpoint), status, error: errMsg, userId: rec.userId })
  // keep subscription for retry on other errors
  remaining.push(rec)
      }
    }
    // Save remaining subscriptions
    try { fs.writeFileSync(file, JSON.stringify(remaining, null, 2)) } catch (e) { log('subscriptions_write_error', { error: (e as Error).message }) }
    const sent = results.filter(r => r.ok).length
    const gone = results.filter(r => r.error === 'gone').length
    const failed = results.filter(r => !r.ok && r.error !== 'gone').length
    log('push_summary', { total: results.length, sent, gone, failed })
    return NextResponse.json({ ok: true, sent, results, summary: { total: results.length, gone, failed } })
  } catch {
    log('unhandled_error', {})
    return new NextResponse('Server error', { status: 500 })
  }
}
