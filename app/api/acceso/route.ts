import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

// Misma firma que el middleware (SHA-256 de salt|password)
const SALT = 'compras-vidal-2026'
const firmar = (password: string) => createHash('sha256').update(`${SALT}|${password}`).digest('hex')

export async function POST(req: NextRequest) {
  const esperada = process.env.APP_PASSWORD
  if (!esperada) return NextResponse.json({ ok: true }) // protección desactivada

  let password = ''
  try {
    const body = await req.json()
    password = String(body?.password ?? '')
  } catch {
    return NextResponse.json({ ok: false, error: 'Petición inválida' }, { status: 400 })
  }

  if (password !== esperada) {
    return NextResponse.json({ ok: false, error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('cv_acceso', firmar(esperada), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 días
    path: '/',
  })
  return res
}
