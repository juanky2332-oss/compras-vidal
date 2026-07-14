import { NextResponse } from 'next/server'
import { llamarN8n, nubeConfigurada } from '@/lib/n8nHistorico'

export const dynamic = 'force-dynamic'

// Diagnóstico público (exento de contraseña en el middleware): informa del
// estado de la conexión con el Google Sheet SIN exponer ningún dato.
export async function GET() {
  const protegida = Boolean(process.env.APP_PASSWORD)
  if (!nubeConfigurada()) {
    return NextResponse.json({ nube: 'sin-configurar', protegida })
  }
  try {
    const data = await llamarN8n({ action: 'list' })
    const filas = Array.isArray(data.rows) ? data.rows.length : 0
    return NextResponse.json({ nube: 'ok', filas, protegida })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    return NextResponse.json({
      nube: msg === 'token-rechazado' ? 'token-incorrecto' : 'n8n-inaccesible',
      detalle: msg,
      protegida,
    })
  }
}
