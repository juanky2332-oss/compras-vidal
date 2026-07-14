// ─────────────────────────────────────────────────────────────────────────
//  Cliente de sincronización con /api/historico (Google Sheets vía n8n).
//  Si el envío falla (sin red, n8n caído), las filas quedan en una cola
//  local (localStorage) y se reintentan en la siguiente carga.
// ─────────────────────────────────────────────────────────────────────────

import type { FilaHistorico } from './secciones'

const PENDIENTES_KEY = 'cv_sync_pendientes_v1'

export interface ResultadoNube {
  configurado: boolean
  rows: FilaHistorico[]
}

// null = error de red/servidor (distinto de "no configurado")
export async function listarNube(): Promise<ResultadoNube | null> {
  try {
    const r = await fetch('/api/historico', { cache: 'no-store' })
    if (r.status === 401) {
      // sesión caducada o pestaña abierta de antes de activar la contraseña:
      // llevar al login para renovar la cookie
      window.location.href = '/acceso'
      return null
    }
    if (!r.ok) return null
    const data = await r.json()
    if (!data?.configurado) return { configurado: false, rows: [] }
    return { configurado: true, rows: Array.isArray(data.rows) ? data.rows : [] }
  } catch {
    return null
  }
}

export async function subirFilas(filas: FilaHistorico[]): Promise<boolean> {
  if (!filas.length) return true
  try {
    const r = await fetch('/api/historico', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: filas }),
    })
    if (!r.ok) throw new Error(String(r.status))
    const data = await r.json()
    if (!data?.ok) throw new Error('respuesta sin ok')
    quitarPendientes(filas.map((f) => f.id))
    return true
  } catch {
    guardarPendientes(filas)
    return false
  }
}

// ── Cola de pendientes (reintento tras fallo de red) ─────────────────────

export function cargarPendientes(): FilaHistorico[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PENDIENTES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function guardarPendientes(filas: FilaHistorico[]): void {
  if (typeof window === 'undefined') return
  try {
    const map = new Map(cargarPendientes().map((f) => [f.id, f]))
    for (const f of filas) map.set(f.id, f)
    localStorage.setItem(PENDIENTES_KEY, JSON.stringify(Array.from(map.values())))
  } catch {
    // cuota llena: se pierde el reintento, la próxima reconciliación lo re-detecta
  }
}

function quitarPendientes(ids: string[]): void {
  if (typeof window === 'undefined') return
  try {
    const idsSet = new Set(ids)
    const restantes = cargarPendientes().filter((f) => !idsSet.has(f.id))
    localStorage.setItem(PENDIENTES_KEY, JSON.stringify(restantes))
  } catch {
    // ignorar
  }
}
