// ─────────────────────────────────────────────────────────────────────────
//  Secciones de fábrica — histórico de compras por departamento
//  Los datos se guardan en localStorage del navegador (clave cv_secciones_v1).
//  Exportable/importable como JSON para copia de seguridad o cambio de equipo.
// ─────────────────────────────────────────────────────────────────────────

export interface CompraSeccion {
  id: string
  fecha: string              // 'YYYY-MM-DD'
  sapCodigo: string          // '' si aún sin código
  descripcion: string
  cantidad: number
  precioUnitario: number | null  // precio aproximado por unidad (€); null = pendiente
  proveedor: string
  notas?: string
}

export interface Seccion {
  id: string
  nombre: string
  color: string              // color de acento de la sección
  compras: CompraSeccion[]
  creadaEn: string           // ISO
}

const STORAGE_KEY = 'cv_secciones_v1'

// Paleta de acentos que rota al crear secciones
export const COLORES_SECCION = [
  '#818cf8', // indigo
  '#a78bfa', // violeta
  '#34d399', // esmeralda
  '#fbbf24', // ámbar
  '#38bdf8', // cielo
  '#fb7185', // rosa
  '#2dd4bf', // teal
  '#fb923c', // naranja
  '#e879f9', // fucsia
]

// Secciones de fábrica iniciales (se crean la primera vez, luego el usuario manda)
const SECCIONES_INICIALES = [
  'Producción',
  'Planta Piloto',
  'Empaquetado',
  'Pre-empaquetado',
  'Regaliz',
  'Expediciones',
  'Espumoso',
  'Caramelo Blando',
  'Caramelo Duro',
]

export function nuevoId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function hoyISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function seedSecciones(): Seccion[] {
  const ahora = new Date().toISOString()
  return SECCIONES_INICIALES.map((nombre, i) => ({
    id: nuevoId() + '-' + i,
    nombre,
    color: COLORES_SECCION[i % COLORES_SECCION.length],
    compras: [],
    creadaEn: ahora,
  }))
}

// ── Persistencia ──────────────────────────────────────────────────────────

export function cargarSecciones(): Seccion[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seed = seedSecciones()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
      return seed
    }
    const parsed = JSON.parse(raw) as Seccion[]
    if (!Array.isArray(parsed)) return seedSecciones()
    return parsed
  } catch {
    return seedSecciones()
  }
}

export function guardarSecciones(secciones: Seccion[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(secciones))
  } catch {
    // cuota llena o modo privado: no romper la UI
  }
}

// ── Estadísticas ──────────────────────────────────────────────────────────

export function statsSeccion(s: Seccion): {
  articulos: number
  unidades: number
  gastoAprox: number
  conPrecio: number
  ultimaFecha: string | null
} {
  let unidades = 0
  let gastoAprox = 0
  let conPrecio = 0
  let ultimaFecha: string | null = null
  for (const c of s.compras) {
    unidades += c.cantidad
    if (c.precioUnitario != null) {
      gastoAprox += c.precioUnitario * c.cantidad
      conPrecio++
    }
    if (!ultimaFecha || c.fecha > ultimaFecha) ultimaFecha = c.fecha
  }
  return { articulos: s.compras.length, unidades, gastoAprox, conPrecio, ultimaFecha }
}

// Agrupa el histórico por código SAP (o por descripción si no hay código)
export interface ArticuloAgrupado {
  clave: string
  sapCodigo: string
  descripcion: string
  proveedor: string
  veces: number
  unidadesTotal: number
  gastoAprox: number
  ultimoPrecio: number | null
  ultimaFecha: string
}

export function agruparPorArticulo(compras: CompraSeccion[]): ArticuloAgrupado[] {
  const map = new Map<string, ArticuloAgrupado>()
  // recorrer ordenado por fecha ascendente para que "último precio" sea el más reciente
  const ordenadas = [...compras].sort((a, b) => a.fecha.localeCompare(b.fecha))
  for (const c of ordenadas) {
    const clave = c.sapCodigo || `desc:${c.descripcion.toLowerCase().trim()}`
    const prev = map.get(clave)
    if (!prev) {
      map.set(clave, {
        clave,
        sapCodigo: c.sapCodigo,
        descripcion: c.descripcion,
        proveedor: c.proveedor,
        veces: 1,
        unidadesTotal: c.cantidad,
        gastoAprox: c.precioUnitario != null ? c.precioUnitario * c.cantidad : 0,
        ultimoPrecio: c.precioUnitario,
        ultimaFecha: c.fecha,
      })
    } else {
      prev.veces++
      prev.unidadesTotal += c.cantidad
      if (c.precioUnitario != null) {
        prev.gastoAprox += c.precioUnitario * c.cantidad
        prev.ultimoPrecio = c.precioUnitario
      }
      prev.ultimaFecha = c.fecha
      if (c.descripcion) prev.descripcion = c.descripcion
      if (c.proveedor) prev.proveedor = c.proveedor
    }
  }
  return Array.from(map.values()).sort((a, b) => b.veces - a.veces || b.ultimaFecha.localeCompare(a.ultimaFecha))
}

// ── Formato ───────────────────────────────────────────────────────────────

export function fmtEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
}

export function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ── Export CSV / JSON backup ──────────────────────────────────────────────

function descargarFichero(nombre: string, contenido: string, mime: string) {
  const blob = new Blob(['﻿' + contenido], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export function exportarCSVSeccion(s: Seccion): void {
  const filas = [
    ['Fecha', 'Código SAP', 'Descripción', 'Cantidad', 'Precio unit. (€)', 'Total (€)', 'Proveedor', 'Notas'].join(';'),
    ...[...s.compras]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((c) =>
        [
          fmtFecha(c.fecha),
          c.sapCodigo,
          `"${c.descripcion.replace(/"/g, '""')}"`,
          c.cantidad,
          c.precioUnitario != null ? String(c.precioUnitario).replace('.', ',') : '',
          c.precioUnitario != null ? String(c.precioUnitario * c.cantidad).replace('.', ',') : '',
          `"${(c.proveedor || '').replace(/"/g, '""')}"`,
          `"${(c.notas || '').replace(/"/g, '""')}"`,
        ].join(';')
      ),
  ]
  descargarFichero(`seccion-${s.nombre.toLowerCase().replace(/\s+/g, '-')}-${hoyISO()}.csv`, filas.join('\r\n'), 'text/csv;charset=utf-8')
}

export function exportarBackupJSON(secciones: Seccion[]): void {
  descargarFichero(`secciones-backup-${hoyISO()}.json`, JSON.stringify(secciones, null, 2), 'application/json')
}

export function parsearBackupJSON(texto: string): Seccion[] | null {
  try {
    const parsed = JSON.parse(texto)
    if (!Array.isArray(parsed)) return null
    // validación mínima de estructura
    for (const s of parsed) {
      if (typeof s?.id !== 'string' || typeof s?.nombre !== 'string' || !Array.isArray(s?.compras)) return null
    }
    return parsed as Seccion[]
  } catch {
    return null
  }
}
