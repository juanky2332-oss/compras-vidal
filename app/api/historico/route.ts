import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Proxy hacia el webhook n8n que lee/escribe el Google Sheet "historico vidal".
// El token nunca llega al navegador: vive solo en las env vars del servidor.
const N8N_URL = process.env.N8N_HISTORICO_URL || ''
const N8N_TOKEN = process.env.N8N_HISTORICO_TOKEN || ''

const configurado = () => Boolean(N8N_URL && N8N_TOKEN)

async function llamarN8n(payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(N8N_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-historico-token': N8N_TOKEN },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const texto = await res.text()
  if (!res.ok || !texto) throw new Error(`n8n respondió ${res.status}`)
  return JSON.parse(texto)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizarFila(r: any) {
  const precioRaw = r?.precio_unitario
  const precio =
    precioRaw === '' || precioRaw === null || precioRaw === undefined
      ? null
      : Number(String(precioRaw).replace(',', '.'))
  return {
    id: String(r?.id ?? ''),
    seccion: String(r?.seccion ?? ''),
    fecha: String(r?.fecha ?? ''),
    sap: String(r?.sap ?? ''),
    descripcion: String(r?.descripcion ?? ''),
    cantidad: Number(r?.cantidad) || 0,
    precio_unitario: precio != null && !isNaN(precio) ? precio : null,
    proveedor: String(r?.proveedor ?? ''),
    notas: String(r?.notas ?? ''),
    estado: r?.estado === 'borrada' ? ('borrada' as const) : ('activa' as const),
  }
}

export async function GET() {
  if (!configurado()) return NextResponse.json({ configurado: false, rows: [] })
  try {
    const data = await llamarN8n({ action: 'list' })
    const rows = (Array.isArray(data.rows) ? data.rows : []).map(normalizarFila).filter((r) => r.id)
    return NextResponse.json({ configurado: true, rows })
  } catch (e) {
    console.error('Historico list error:', e)
    return NextResponse.json({ error: 'No se pudo leer el histórico en la nube' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  if (!configurado()) return NextResponse.json({ configurado: false, ok: false })
  try {
    const { rows } = await req.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Sin filas' }, { status: 400 })
    }
    if (rows.length > 300) {
      return NextResponse.json({ ok: false, error: 'Máximo 300 filas por envío' }, { status: 400 })
    }
    await llamarN8n({ action: 'upsert', rows: rows.map(normalizarFila).filter((r) => r.id) })
    return NextResponse.json({ ok: true, guardadas: rows.length })
  } catch (e) {
    console.error('Historico upsert error:', e)
    return NextResponse.json({ error: 'No se pudo guardar en el histórico' }, { status: 502 })
  }
}
