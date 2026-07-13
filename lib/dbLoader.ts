import fs from 'fs'
import path from 'path'

export interface MarcaRow {
  'Marca / Familia': string
  'Categoría': string
  'Proveedor PRINCIPAL': string
  'Cód. Prov. Principal': string
  'Alternativa': string
  'Cód. Alt.': string
  'Notas': string
}

export interface GuiaRow {
  'Tipo de Material / Marca': string
  'Categoría': string
  'Proveedor PRINCIPAL': string
  'Cód. Proveedor PRINCIPAL': string
  'Alternativa 1': string
  'Cód. Alternativa 1': string
  'Alternativa 2': string
  'Cód. Alternativa 2': string
  'Palabras clave de detección': string
  'Notas técnicas': string
}

export interface SapRow {
  'Código SAP': string
  'Descripción Material': string
  'Veces Comprado': string
  'Cód. Proveedor PRINCIPAL': string
  'Nombre Proveedor PRINCIPAL': string
  'Veces con Principal': string
  'Nº Proveedores Distintos': string
  'Proveedores Alternativos (histórico)': string
}

export interface ProveedorRow {
  'Código Proveedor': string
  'Nombre Proveedor': string
  'Categoría': string
  'Tipo de Material Habitual': string
  'Marca/Familia Principal': string
  'Total Compras (2025-2026)': string
  'SAPs Distintos': string
  'Prioridad de Uso': string
  'Notas / Observaciones': string
}

// Catálogo completo de códigos SAP (todos los existentes en el sistema, con o sin historial)
export interface CatalogoSapRow {
  codigo: string
  descripcion: string
}

export interface DbData {
  marcas: MarcaRow[]
  guia: GuiaRow[]
  proveedores: ProveedorRow[]
  sapHistorico: SapRow[]
  sapIndex: Map<string, SapRow>
  catalogo: CatalogoSapRow[]         // catálogo SAP completo (del Excel, pestaña nueva)
  catalogoIndex: Map<string, string>  // codigo → descripcion
}

let cache: DbData | null = null

// Columnas posibles para código y descripción en la pestaña del catálogo SAP
const CODIGO_KEYS = ['Código SAP', 'Codigo SAP', 'codigo', 'Código', 'Material', 'Nº Material', 'SAP']
const DESC_KEYS = ['Descripción Material', 'Descripcion Material', 'Descripción', 'Descripcion',
  'Texto breve de material', 'Texto breve material', 'Texto breve', 'Nombre']

function findKey(obj: Record<string, string>, candidates: string[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const keys = Object.keys(obj)
  for (const c of candidates) {
    const found = keys.find((k) => norm(k) === norm(c))
    if (found) return found
  }
  return undefined
}

function loadCatalogo(dataDir: string): CatalogoSapRow[] {
  const filePath = path.join(dataDir, 'catalogo_sap.json')
  if (!fs.existsSync(filePath)) return []
  try {
    const raw: Record<string, string>[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (!raw.length) return []
    // Si ya tiene la forma {codigo, descripcion} (normalizado por el script) → usar directo
    if ('codigo' in raw[0] && 'descripcion' in raw[0]) {
      return raw
        .map((r) => ({ codigo: String(r.codigo || '').trim(), descripcion: String(r.descripcion || '').trim() }))
        .filter((r) => r.codigo && r.descripcion)
    }
    // Si tiene columnas originales del Excel → mapear flexiblemente
    const ck = findKey(raw[0], CODIGO_KEYS)
    const dk = findKey(raw[0], DESC_KEYS)
    if (!ck || !dk) return []
    return raw
      .map((r) => ({ codigo: String(r[ck] || '').trim(), descripcion: String(r[dk] || '').trim() }))
      .filter((r) => r.codigo && r.descripcion && /^\d+$/.test(r.codigo))
  } catch {
    return []
  }
}

export function loadDb(): DbData {
  if (cache) return cache

  // Los datos viven en /data (fuera de public/) para que el histórico de compras
  // no sea descargable desde la URL pública de la app.
  const dataDir = path.join(process.cwd(), 'data')

  const marcas: MarcaRow[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'marcas_a_proveedor.json'), 'utf-8'))
  const guia: GuiaRow[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'guia_por_tipo_material.json'), 'utf-8'))
  const proveedores: ProveedorRow[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'proveedores.json'), 'utf-8'))
  const sapHistorico: SapRow[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'sap_historico.json'), 'utf-8'))
  const catalogo = loadCatalogo(dataDir)

  const sapIndex = new Map<string, SapRow>()
  for (const row of sapHistorico) {
    if (row['Código SAP']) sapIndex.set(row['Código SAP'].trim(), row)
  }

  const catalogoIndex = new Map<string, string>()
  for (const row of catalogo) {
    if (row.codigo) catalogoIndex.set(row.codigo, row.descripcion)
  }

  cache = { marcas, guia, proveedores, sapHistorico, sapIndex, catalogo, catalogoIndex }
  return cache
}

export function getDbStats(): { marcas: number; proveedores: number; saps: number; catalogo: number } {
  const db = loadDb()
  return {
    marcas: db.marcas.length,
    proveedores: db.proveedores.length,
    saps: db.sapHistorico.length,
    catalogo: db.catalogo.length,
  }
}
