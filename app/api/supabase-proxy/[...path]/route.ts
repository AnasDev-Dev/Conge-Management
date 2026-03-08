import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://cogneapp-kong:8000'

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const target = `${SUPABASE_URL}/${path.join('/')}`
  const url = new URL(target)
  url.search = req.nextUrl.search

  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    if (key !== 'host' && key !== 'connection') {
      headers[key] = value
    }
  })

  let body: BodyInit | null = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer()
  }

  try {
    const res = await fetch(url.toString(), {
      method: req.method,
      headers,
      body,
    })

    const responseHeaders = new Headers()
    res.headers.forEach((value, key) => {
      if (key !== 'transfer-encoding' && key !== 'content-encoding') {
        responseHeaders.set(key, value)
      }
    })

    return new NextResponse(await res.arrayBuffer(), {
      status: res.status,
      headers: responseHeaders,
    })
  } catch (err) {
    console.error('Proxy error:', err)
    return NextResponse.json({ error: 'Proxy failed', detail: String(err) }, { status: 502 })
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
