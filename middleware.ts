import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Protección opcional por contraseña compartida.
// Si APP_PASSWORD no está definida en las env vars, la app queda abierta
// (igual que hasta ahora) — así el deploy nunca se rompe por falta de config.

const COOKIE = 'cv_acceso'
const SALT = 'compras-vidal-2026'

async function firmar(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}|${password}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD
  if (!password) return NextResponse.next()

  const { pathname } = req.nextUrl
  // /api/salud es diagnóstico sin datos — accesible sin contraseña
  if (pathname === '/acceso' || pathname === '/api/acceso' || pathname === '/api/salud') return NextResponse.next()

  const cookie = req.cookies.get(COOKIE)?.value
  if (cookie && cookie === (await firmar(password))) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/acceso'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
