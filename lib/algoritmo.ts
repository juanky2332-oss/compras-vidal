import type { MarcaRow, GuiaRow, SapRow, ProveedorRow, DbData } from './dbLoader'

export interface CandidatoProveedor {
  nombre: string
  codigo: string
  nota?: string
}

export interface ResultadoAlgoritmo {
  pasoDeterminante: 1 | 2 | 3 | 4 | 5
  tipoMaterial: string
  categoria: string
  marcaDetectada: string
  sapEnSolicitud: string
  principal: CandidatoProveedor | null
  alternativas: CandidatoProveedor[]
  sapsSugeridos: Array<{ codigo: string; descripcion: string; proveedor: string }>
  candidatoCentralizar: boolean
  notasSap: string
  notasGuia: string
}

// Equivalencias de proveedor: críticas, no negociables
const EQUIV_CODIGO: Record<string, { codigo: string; nombre: string }> = {
  '100025296': { codigo: '100035845', nombre: 'BERDIN LEVANTE' },
}
const EQUIV_NOMBRE_CONTIENE: Array<{ patron: string; codigo: string; nombre: string }> = [
  { patron: 'INOXIDABLES DE MOLINA', codigo: '100034920', nombre: 'EFIX' },
]
const MATINOX_CODE = '100025303'
const EFIX_CODE = '100034920'
const EFIX_NOMBRE = 'EFIX'

function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s\/\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function aplicarEquivalencia(codigo: string, nombre: string): { codigo: string; nombre: string } {
  if (EQUIV_CODIGO[codigo]) return EQUIV_CODIGO[codigo]
  for (const e of EQUIV_NOMBRE_CONTIENE) {
    if (nombre.toUpperCase().includes(e.patron)) return { codigo: e.codigo, nombre: e.nombre }
  }
  return { codigo, nombre }
}

function normalizarProveedor(codigo: string, nombre: string): CandidatoProveedor {
  const eq = aplicarEquivalencia(codigo, nombre)
  return { codigo: eq.codigo, nombre: eq.nombre }
}

function esSapGenerico(sap: string): boolean {
  return /^0*599000000$/.test((sap ?? '').replace(/\s/g, ''))
}

// Extrae código SAP de la descripción si lo contiene (6 dígitos o más, numérico)
function extraerSAPDeSolicitud(descripcion: string): string {
  const m = descripcion.match(/\b([5][0-9]{8})\b/)
  return m ? m[1] : ''
}

// PASO 1: Detectar MARCA en MARCAS_A_PROVEEDOR
function paso1Marca(descNorm: string, marcas: MarcaRow[]): { marcaRow: MarcaRow; marcaDetectada: string } | null {
  for (const row of marcas) {
    const marcaNorm = norm(row['Marca / Familia'])
    if (!marcaNorm) continue
    // Split por '/', '(' y espacio para cubrir: "SKF / INA / FAG", "SCHNEIDER ELECTRIC", "B&R / BR Automation"
    const variantes = marcaNorm
      .split(/[\/\(\s]+/)
      .map((v) => v.trim())
      .filter((v) => v.length >= 3) // mínimo 3 chars para evitar falsos positivos
    for (const v of variantes) {
      const regex = new RegExp(`(?:^|\\s|-)${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|-|$|\\d)`)
      if (descNorm.includes(v) || regex.test(descNorm)) {
        return { marcaRow: row, marcaDetectada: row['Marca / Familia'] }
      }
    }
  }
  return null
}

// PASO 2: Detectar TIPO DE MATERIAL por palabras clave en GUIA
function paso2Guia(descNorm: string, guia: GuiaRow[]): GuiaRow | null {
  let mejorMatch: GuiaRow | null = null
  let mejorScore = 0
  for (const row of guia) {
    const kwStr = row['Palabras clave de detección'] ?? ''
    const keywords = kwStr.split(',').map((k) => norm(k.trim())).filter((k) => k.length >= 2)
    let score = 0
    for (const kw of keywords) {
      if (descNorm.includes(kw)) score++
    }
    if (score > mejorScore) {
      mejorScore = score
      mejorMatch = row
    }
  }
  return mejorScore > 0 ? mejorMatch : null
}

// PASO 3: Buscar por código SAP
function paso3SAP(sapCode: string, sapIndex: Map<string, SapRow>): SapRow | null {
  if (!sapCode || esSapGenerico(sapCode)) return null
  return sapIndex.get(sapCode) || null
}

// PASO 4: Fallback por categoría
function paso4Categoria(categoria: string, proveedores: ProveedorRow[]): ProveedorRow[] {
  const catNorm = norm(categoria)
  return proveedores
    .filter((p) => norm(p['Categoría']).includes(catNorm) || catNorm.includes(norm(p['Categoría'])))
    .sort((a, b) => Number(b['Total Compras (2025-2026)']) - Number(a['Total Compras (2025-2026)']))
    .slice(0, 3)
}

export function ejecutarAlgoritmo(descripcion: string, db: DbData): ResultadoAlgoritmo {
  const descNorm = norm(descripcion)
  const sapEnSolicitud = extraerSAPDeSolicitud(descripcion)

  let pasoDeterminante: 1 | 2 | 3 | 4 | 5 = 5
  let tipoMaterial = 'No clasificado'
  let categoria = ''
  let marcaDetectada = 'no especificada'
  let principal: CandidatoProveedor | null = null
  let alternativas: CandidatoProveedor[] = []
  let sapsSugeridos: Array<{ codigo: string; descripcion: string; proveedor: string }> = []
  let candidatoCentralizar = false
  let notasSap = ''
  let notasGuia = ''

  // PASO 3 (antes de 1 y 2 si hay SAP explícito): SAP en solicitud
  if (sapEnSolicitud) {
    const sapRow = paso3SAP(sapEnSolicitud, db.sapIndex)
    if (sapRow) {
      const veces = Number(sapRow['Veces Comprado']) || 0
      const vecesPrincipal = Number(sapRow['Veces con Principal']) || 0
      const confianzaPrincipal = veces > 0 ? vecesPrincipal / veces : 0
      const nProveedores = Number(sapRow['Nº Proveedores Distintos']) || 0

      if (nProveedores >= 3) {
        candidatoCentralizar = true
        notasSap = `Candidato a centralizar (${nProveedores} proveedores distintos)`
      }

      if (confianzaPrincipal >= 0.7) {
        pasoDeterminante = 3
        tipoMaterial = sapRow['Descripción Material']
        principal = normalizarProveedor(sapRow['Cód. Proveedor PRINCIPAL'], sapRow['Nombre Proveedor PRINCIPAL'])
        sapsSugeridos = [{ codigo: sapEnSolicitud, descripcion: sapRow['Descripción Material'], proveedor: sapRow['Nombre Proveedor PRINCIPAL'] }]

        // Alternativas desde "Proveedores Alternativos"
        const altsStr = sapRow['Proveedores Alternativos (histórico)'] ?? ''
        const altMatches = [...altsStr.matchAll(/(\d{9,12})\s*-\s*([^|]+)/g)]
        for (const m of altMatches.slice(0, 2)) {
          const eq = aplicarEquivalencia(m[1].trim(), m[2].trim())
          if (eq.codigo !== principal.codigo) {
            alternativas.push({ codigo: eq.codigo, nombre: eq.nombre })
          }
        }
        return { pasoDeterminante, tipoMaterial, categoria, marcaDetectada, sapEnSolicitud, principal, alternativas, sapsSugeridos, candidatoCentralizar, notasSap, notasGuia }
      }
    }
  }

  // PASO 1: Marca
  const marcaResult = paso1Marca(descNorm, db.marcas)
  if (marcaResult) {
    const { marcaRow } = marcaResult
    marcaDetectada = marcaRow['Marca / Familia']
    tipoMaterial = marcaRow['Categoría']
    categoria = marcaRow['Categoría']
    pasoDeterminante = 1

    const provPrincipal = normalizarProveedor(marcaRow['Cód. Prov. Principal'], marcaRow['Proveedor PRINCIPAL'])
    principal = provPrincipal

    if (marcaRow['Alternativa'] && marcaRow['Alternativa'] !== '-') {
      const altEq = normalizarProveedor(marcaRow['Cód. Alt.'], marcaRow['Alternativa'])
      if (altEq.codigo !== principal.codigo) {
        alternativas = [{ ...altEq, nota: marcaRow['Notas'] || undefined }]
      }
    }

    // Enriquecer con SAPs del histórico para esta categoría/marca
    const marcaNorm = norm(marcaDetectada)
    const sapsRelacionados = db.sapHistorico
      .filter((s) => norm(s['Descripción Material']).includes(marcaNorm) || norm(s['Nombre Proveedor PRINCIPAL']).includes(norm(principal!.nombre)))
      .sort((a, b) => Number(b['Veces Comprado']) - Number(a['Veces Comprado']))
      .slice(0, 3)

    sapsSugeridos = sapsRelacionados
      .filter((s) => !esSapGenerico(s['Código SAP']))
      .map((s) => ({ codigo: s['Código SAP'], descripcion: s['Descripción Material'], proveedor: s['Nombre Proveedor PRINCIPAL'] }))

    return { pasoDeterminante, tipoMaterial, categoria, marcaDetectada, sapEnSolicitud, principal, alternativas, sapsSugeridos, candidatoCentralizar, notasSap, notasGuia }
  }

  // PASO 2: Tipo de material por keywords en GUIA
  const guiaRow = paso2Guia(descNorm, db.guia)
  if (guiaRow) {
    tipoMaterial = guiaRow['Tipo de Material / Marca']
    categoria = guiaRow['Categoría']
    notasGuia = guiaRow['Notas técnicas']
    pasoDeterminante = 2

    principal = normalizarProveedor(guiaRow['Cód. Proveedor PRINCIPAL'], guiaRow['Proveedor PRINCIPAL'])

    const alts: CandidatoProveedor[] = []
    if (guiaRow['Alternativa 1'] && guiaRow['Alternativa 1'].trim()) {
      const a1 = normalizarProveedor(guiaRow['Cód. Alternativa 1'], guiaRow['Alternativa 1'])
      if (a1.codigo !== principal.codigo) alts.push(a1)
    }
    if (guiaRow['Alternativa 2'] && guiaRow['Alternativa 2'].trim()) {
      const a2 = normalizarProveedor(guiaRow['Cód. Alternativa 2'], guiaRow['Alternativa 2'])
      if (a2.codigo !== principal.codigo && !alts.some((a) => a.codigo === a2.codigo)) alts.push(a2)
    }
    alternativas = alts

    // SAPs relacionados con el tipo de material
    const tipoNorm = norm(tipoMaterial).split(' ').filter((t) => t.length >= 4)[0] || ''
    if (tipoNorm) {
      sapsSugeridos = db.sapHistorico
        .filter((s) => !esSapGenerico(s['Código SAP']) && norm(s['Descripción Material']).includes(tipoNorm))
        .sort((a, b) => Number(b['Veces Comprado']) - Number(a['Veces Comprado']))
        .slice(0, 3)
        .map((s) => ({ codigo: s['Código SAP'], descripcion: s['Descripción Material'], proveedor: s['Nombre Proveedor PRINCIPAL'] }))
    }

    return { pasoDeterminante, tipoMaterial, categoria, marcaDetectada, sapEnSolicitud, principal, alternativas, sapsSugeridos, candidatoCentralizar, notasSap, notasGuia }
  }

  // PASO 4: Fallback por categoría genérica
  // Intentar inferir categoría desde palabras clave comunes
  const categoriaInferida = inferirCategoria(descNorm)
  if (categoriaInferida) {
    categoria = categoriaInferida
    tipoMaterial = categoriaInferida
    pasoDeterminante = 4
    const provsFallback = paso4Categoria(categoriaInferida, db.proveedores)
    if (provsFallback.length > 0) {
      principal = normalizarProveedor(provsFallback[0]['Código Proveedor'], provsFallback[0]['Nombre Proveedor'])
      alternativas = provsFallback.slice(1).map((p) => normalizarProveedor(p['Código Proveedor'], p['Nombre Proveedor']))
    }
  }

  // PASO 5: No hay match → pedir aclaración
  if (!principal) {
    pasoDeterminante = 5
  }

  return { pasoDeterminante, tipoMaterial, categoria, marcaDetectada, sapEnSolicitud, principal, alternativas, sapsSugeridos, candidatoCentralizar, notasSap, notasGuia }
}

function inferirCategoria(descNorm: string): string {
  const mapaCategorias: Array<{ keywords: string[]; categoria: string }> = [
    { keywords: ['rodamiento', 'cojinete', 'bearing'], categoria: 'RODAMIENTOS' },
    { keywords: ['banda', 'correa', 'transportadora', 'conveyor'], categoria: 'BANDAS TRANSPORTADORAS' },
    { keywords: ['motor', 'servo', 'variador', 'inverter'], categoria: 'ELECTRICIDAD / AUTOMATIZACIÓN' },
    { keywords: ['contactor', 'rele', 'magnetotermico', 'disyuntor', 'interruptor', 'pulsador'], categoria: 'ELECTRICIDAD / AUTOMATIZACIÓN' },
    { keywords: ['sensor', 'detector', 'encoder', 'fotocélula', 'fotocelula'], categoria: 'ELECTRICIDAD / AUTOMATIZACIÓN' },
    { keywords: ['cable', 'manguera electrica', 'hilo'], categoria: 'ELECTRICIDAD / AUTOMATIZACIÓN' },
    { keywords: ['inox', 'acero inoxidable', 'machon', 'codo', 'brida', 'tuberia', 'junta', 'union'], categoria: 'INOX / FONTANERÍA' },
    { keywords: ['bomba', 'centrifuga', 'peristaltica', 'tornillo'], categoria: 'BOMBAS' },
    { keywords: ['neumatica', 'cilindro', 'valvula neumatica', 'presion', 'compresor'], categoria: 'NEUMÁTICA' },
    { keywords: ['hidraulica', 'latiguillo', 'manguito hidraulico'], categoria: 'HIDRÁULICA' },
    { keywords: ['tornillo', 'tuerca', 'arandela', 'ferreteria', 'perno'], categoria: 'FERRETERÍA' },
    { keywords: ['cadena', 'piñon', 'sprocket', 'rexnord'], categoria: 'TRANSMISIÓN MECÁNICA' },
    { keywords: ['lubricante', 'aceite', 'grasa'], categoria: 'LUBRICANTES' },
    { keywords: ['etiqueta', 'marcaje', 'impresora', 'tinta', 'ribbon'], categoria: 'MARCAJE' },
  ]

  for (const entry of mapaCategorias) {
    if (entry.keywords.some((kw) => descNorm.includes(kw))) {
      return entry.categoria
    }
  }
  return ''
}
