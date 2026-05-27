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

export interface DbData {
  marcas: MarcaRow[]
  guia: GuiaRow[]
  proveedores: ProveedorRow[]
  sapHistorico: SapRow[]
  sapIndex: Map<string, SapRow>
}

let cache: DbData | null = null

export function loadDb(): DbData {
  if (cache) return cache

  const dataDir = path.join(process.cwd(), 'public', 'data')

  const marcas: MarcaRow[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'marcas_a_proveedor.json'), 'utf-8'))
  const guia: GuiaRow[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'guia_por_tipo_material.json'), 'utf-8'))
  const proveedores: ProveedorRow[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'proveedores.json'), 'utf-8'))
  const sapHistorico: SapRow[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'sap_historico.json'), 'utf-8'))

  const sapIndex = new Map<string, SapRow>()
  for (const row of sapHistorico) {
    if (row['Código SAP']) sapIndex.set(row['Código SAP'].trim(), row)
  }

  cache = { marcas, guia, proveedores, sapHistorico, sapIndex }
  return cache
}

export function getDbStats(): { marcas: number; proveedores: number; saps: number } {
  const db = loadDb()
  return {
    marcas: db.marcas.length,
    proveedores: db.proveedores.length,
    saps: db.sapHistorico.length,
  }
}
