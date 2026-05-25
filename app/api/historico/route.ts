import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Google Sheet del histórico Vidal — mismo fichero que usa el workflow n8n
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1PgW3_lherbn5nQYFsu-YsVsxYVKJ4KTS'
const SHEET_GID = process.env.GOOGLE_SHEET_GID || '992286027'

// Cache en memoria del proceso (se resetea en cold starts, pero funciona entre peticiones)
let memCache: { rows: Record<string, string>[]; ts: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hora

export async function GET() {
  try {
    // Servir desde cache si está fresco
    if (memCache && Date.now() - memCache.ts < CACHE_TTL_MS) {
      return NextResponse.json({
        rows: memCache.rows,
        filas: memCache.rows.length,
        fromCache: true,
        cachedAt: new Date(memCache.ts).toISOString(),
      })
    }

    // Descargar el Google Sheet como CSV (requiere que el sheet sea "Cualquiera con el enlace puede ver")
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ComprasVidal/1.0' },
      // Vercel edge cache 1h
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      // Si Google redirige a login, el sheet es privado
      const isAuthError = res.status === 401 || res.status === 403 || res.url?.includes('accounts.google.com')
      return NextResponse.json(
        {
          error: isAuthError
            ? 'El Google Sheet es privado. Compártelo como "Cualquiera con el enlace puede ver" en Google Drive.'
            : `Error al descargar el histórico: HTTP ${res.status}`,
          needsPublicSheet: isAuthError,
        },
        { status: 502 }
      )
    }

    const csv = await res.text()

    // Detectar si Google devolvió HTML (redirect a login) en vez de CSV
    if (csv.trimStart().startsWith('<!DOCTYPE') || csv.trimStart().startsWith('<html')) {
      return NextResponse.json(
        {
          error: 'El Google Sheet es privado. Compártelo como "Cualquiera con el enlace puede ver".',
          needsPublicSheet: true,
        },
        { status: 403 }
      )
    }

    const rows = parseCSV(csv)

    memCache = { rows, ts: Date.now() }

    return NextResponse.json({
      rows,
      filas: rows.length,
      fromCache: false,
      cachedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Historico fetch error:', error)
    return NextResponse.json(
      { error: `Error al conectar con Google Drive: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    )
  }
}

// Parser CSV robusto (soporta comas dentro de comillas, saltos de línea, etc.)
function parseCSV(csv: string): Record<string, string>[] {
  const lines = splitCSVLines(csv)
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map((h) => h.trim())
  if (headers.length === 0 || headers.every((h) => !h)) return []

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.every((v) => !v.trim())) continue // fila vacía
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      if (h) row[h] = (values[idx] || '').trim()
    })
    rows.push(row)
  }
  return rows
}

function splitCSVLines(csv: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      current += ch
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && csv[i + 1] === '\n') i++
      if (current.trim()) lines.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) lines.push(current)
  return lines
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''))
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''))
  return result
}
