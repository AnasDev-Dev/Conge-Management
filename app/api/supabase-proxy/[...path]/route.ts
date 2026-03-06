import { NextRequest, NextResponse } from 'next/server'
import https from 'https'
import http from 'http'

const SUPABASE_URL = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://cogneapp-kong:8000'

function proxyRequest(
  targetUrl: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | null
): Promise<{ status: number; headers: Record<string, string | string[]>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const isHttps = targetUrl.protocol === 'https:'
    const transport = isHttps ? https : http

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method,
      headers,
      ...(isHttps ? { rejectUnauthorized: false } : {}),
    }

    const req = transport.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode || 500,
          headers: (res.headers || {}) as Record<string, string | string[]>,
          body: Buffer.concat(chunks),
        })
      })
    })

    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

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

  let body: Buffer | null = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const ab = await req.arrayBuffer()
    body = Buffer.from(ab)
  }

  try {
    const res = await proxyRequest(url, req.method, headers, body)

    const responseHeaders = new Headers()
    for (const [key, value] of Object.entries(res.headers)) {
      if (key === 'transfer-encoding' || key === 'content-encoding') continue
      if (Array.isArray(value)) {
        value.forEach(v => responseHeaders.append(key, v))
      } else if (value) {
        responseHeaders.set(key, value)
      }
    }

    return new NextResponse(res.body as unknown as BodyInit, {
      status: res.status,
      headers: responseHeaders,
    })
  } catch (err) {
    console.error('Proxy error:', err)
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 })
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
