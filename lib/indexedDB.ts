import type { HistoricoRow } from './types'

const STORE_KEY = 'historico_vidal_v1'

async function getLF() {
  if (typeof window === 'undefined') return null
  const lf = await import('localforage')
  return lf.default
}

export async function saveHistorico(rows: HistoricoRow[]): Promise<void> {
  const lf = await getLF()
  if (!lf) return
  await lf.setItem(STORE_KEY, rows)
}

export async function getHistorico(): Promise<HistoricoRow[]> {
  const lf = await getLF()
  if (!lf) return []
  const rows = await lf.getItem<HistoricoRow[]>(STORE_KEY)
  return rows || []
}

export async function clearHistorico(): Promise<void> {
  const lf = await getLF()
  if (!lf) return
  await lf.removeItem(STORE_KEY)
}
