import type { HistoricoRow } from './types'

const STORE_KEY = 'historico_vidal_v1'
const STORE_META_KEY = 'historico_vidal_meta_v1'

async function getLF() {
  if (typeof window === 'undefined') return null
  const lf = await import('localforage')
  return lf.default
}

interface HistoricoMeta {
  savedAt: number
  filas: number
  source: 'drive' | 'upload'
}

export async function saveHistorico(rows: HistoricoRow[], source: 'drive' | 'upload' = 'upload'): Promise<void> {
  const lf = await getLF()
  if (!lf) return
  await lf.setItem(STORE_KEY, rows)
  await lf.setItem(STORE_META_KEY, { savedAt: Date.now(), filas: rows.length, source } as HistoricoMeta)
}

export async function getHistorico(): Promise<HistoricoRow[]> {
  const lf = await getLF()
  if (!lf) return []
  const rows = await lf.getItem<HistoricoRow[]>(STORE_KEY)
  return rows || []
}

export async function getHistoricoMeta(): Promise<HistoricoMeta | null> {
  const lf = await getLF()
  if (!lf) return null
  return await lf.getItem<HistoricoMeta>(STORE_META_KEY)
}

// Devuelve true si el cache tiene más de maxAgeHours horas de antigüedad
export async function isHistoricoStale(maxAgeHours = 6): Promise<boolean> {
  const meta = await getHistoricoMeta()
  if (!meta) return true
  const ageMs = Date.now() - meta.savedAt
  return ageMs > maxAgeHours * 3600 * 1000
}

export async function clearHistorico(): Promise<void> {
  const lf = await getLF()
  if (!lf) return
  await lf.removeItem(STORE_KEY)
  await lf.removeItem(STORE_META_KEY)
}
