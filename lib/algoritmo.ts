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
  '100025303': { codigo: '100034920', nombre: 'EFIX' }, // MATINOX → EFIX (proveedor en declive)
}
const EQUIV_NOMBRE_CONTIENE: Array<{ patron: string; codigo: string; nombre: string }> = [
  { patron: 'INOXIDABLES DE MOLINA', codigo: '100034920', nombre: 'EFIX' },
]

// Overrides de marca/material con proveedor conocido.
// ORDEN CRÍTICO: los más específicos van PRIMERO (inox sub-tipos antes del inox genérico).
const MARCAS_OVERRIDE: Array<{
  tokens: string[]
  nombre: string
  codigo: string
  tipo: string
  categoria: string
  nota: string
  sapKeywords: string[]
  alternativas: Array<{ nombre: string; codigo: string; nota?: string }>
}> = [
  // ── MARCAS con proveedor específico que pueden contener "inox" en la descripción ──
  // (van ANTES del override genérico de inox para que no sean interceptadas)

  {
    tokens: ['genebre', 'valvula bola'],
    nombre: 'PONTONES GUILLAMÓN,SL.',
    codigo: '100033923',
    tipo: 'Válvulas bola GENEBRE / inox',
    categoria: 'VÁLVULAS',
    nota: 'PONTONES GUILLAMÓN: distribuidor principal GENEBRE. Válvulas bola inox, BSP, con o sin manómetro.',
    sapKeywords: ['valvula bola', 'val bola', 'genebre', 'bola inox'],
    alternativas: [
      { nombre: 'COMERCIAL INDUSTRIAL GARCIA,SA', codigo: '100025256', nota: 'CIG: alternativa histórica válvulas bola inox' },
    ],
  },

  {
    tokens: ['hofma', 'asiento inclinado', 'a.incl'],
    nombre: 'CONTAGAS',
    codigo: '100034263',
    tipo: 'Válvulas asiento inclinado HOFMA',
    categoria: 'VÁLVULAS',
    nota: 'CONTAGAS: distribuidor habitual válvulas HOFMA asiento inclinado inox alimentario.',
    sapKeywords: ['hofma', 'asiento inclinado', 'val asiento', 'a.incl'],
    alternativas: [
      { nombre: 'PONTONES GUILLAMÓN,SL.', codigo: '100033923', nota: 'Alternativa válvulas inox generales' },
    ],
  },

  {
    tokens: ['inoxpa', 'estampinox', 'elmo rietschle'],
    nombre: 'ALFA CEDIVA',
    codigo: '100034454',
    tipo: 'Bombas y válvulas INOXPA / alimentarias',
    categoria: 'BOMBAS / VÁLVULAS',
    nota: 'ALFA CEDIVA: distribuidor INOXPA, ESTAMPINOX y válvulas alimentarias inox.',
    sapKeywords: ['inoxpa', 'estampinox', 'bomba inoxpa', 'val inoxpa'],
    alternativas: [],
  },

  // ── INOX sub-tipos específicos (deben ir ANTES del override genérico de inox) ──

  {
    tokens: ['chapa inox', 'laser inox', 'plancha inox', 'corte inox', 'fabricar chapa inox', 'lamina inox'],
    nombre: 'MAQUISUR 1999, S.L.U.',
    codigo: '100031455',
    tipo: 'Chapa inox a medida / corte láser',
    categoria: 'MATERIAL METÁLICO',
    nota: 'MAQUISUR: fabricación y corte de chapa inox a medida. Troquelajes Yagüés como alternativa para puertas y prelacada.',
    sapKeywords: ['chapa inox', 'laser', 'plancha inox', 'lamina inox'],
    alternativas: [
      { nombre: 'TROQUELAJES YAGUES', codigo: '100034033', nota: 'Alternativa troquelaje y chapa prelacada/puertas Pirineo' },
      { nombre: 'EFIX', codigo: '100034920', nota: 'Para accesorios soldar inox estándar (no chapa)' },
    ],
  },

  {
    tokens: ['malla inox', 'mallas inox'],
    nombre: 'MALLAS INOX CASTELLON',
    codigo: '100034393',
    tipo: 'Mallas inox',
    categoria: 'MATERIAL METÁLICO',
    nota: 'Mallas Inox Castellón: proveedor directo para mallas y redes inox industriales.',
    sapKeywords: ['malla', 'red inox', 'malla electros', 'malla inox'],
    alternativas: [],
  },

  {
    tokens: ['calderia inox', 'caldereria inox', 'deposito inox', 'cedinox', 'deposito acero inox'],
    nombre: 'CEDINOX CALDERIA',
    codigo: '100034810',
    tipo: 'Calderería inox / Depósitos a medida',
    categoria: 'MECANIZADOS METÁLICOS',
    nota: 'CEDINOX: calderería especial inox, fabricación de depósitos y piezas a medida.',
    sapKeywords: ['calderia', 'deposito inox', 'cedinox', 'deposito acero'],
    alternativas: [
      { nombre: 'EFIX', codigo: '100034920', nota: 'Para tubería y accesorios inox de conexión (no calderería)' },
      { nombre: 'INOXIDABLES DE MOLINA (EFIX)', codigo: '100034920', nota: 'Mismo código SAP 100034920' },
    ],
  },

  {
    tokens: ['din 11851', 'din11851', 'din-11851', 'abrazadera inox', 'abrazadera alimentaria', 'racor alimentario'],
    nombre: 'COREFLUID',
    codigo: '100034026',
    tipo: 'Racores DIN 11851 / Abrazaderas inox alimentario',
    categoria: 'FONTANERÍA INOX',
    nota: 'COREFLUID: especialista en racores DIN 11851 (macho, casquillo, tuerca) y abrazaderas alimentarias inox.',
    sapKeywords: ['din 11851', 'din11851', 'abrazadera inox', 'casquillo racor', 'macho racor', 'tuerca racor', 'nw'],
    alternativas: [
      { nombre: 'EFIX', codigo: '100034920', nota: 'EFIX / Inoxidables de Molina: también suministra racores DIN11851 (históricamente MATINOX)' },
      { nombre: 'MATINOX', codigo: '100025303', nota: 'MATINOX: histórico DIN11851 (proveedor en declive, preferir COREFLUID o EFIX)' },
    ],
  },

  // ── INOX GENÉRICO (fallback para todo lo que no encaje en los sub-tipos anteriores) ──
  {
    tokens: ['inox', 'inoxidable', 'acero inox', 'acero inoxidable', 'a-316', 'a-304', 'sch-10', 'sch-40', 'aisi 316', 'aisi 304', 'aisi316', 'aisi304'],
    nombre: 'EFIX',
    codigo: '100034920',
    tipo: 'Material inoxidable / acero inox',
    categoria: 'INOX / FONTANERÍA',
    nota: 'EFIX (Inoxidables de Molina, cód. SAP 100034920): proveedor principal para tubería inox, accesorios de soldar, perfiles y tornillería inox alimentaria. Sustituye a MATINOX (en declive).',
    sapKeywords: ['inox', 'inoxidable', 'a-316', 'a-304', 'sch-10', 'aisi', 'tubo inox', 'codo inox', 'machon', 'puntera', 'brida inox'],
    alternativas: [
      { nombre: 'COMERCIAL INDUSTRIAL GARCIA,SA', codigo: '100025256', nota: 'CIG: válvulas, perfiles y accesorios inox generales' },
      { nombre: 'MATINOX', codigo: '100025303', nota: 'MATINOX: históricamente activo (en declive, preferir EFIX para nuevos pedidos)' },
    ],
  },

  // ── Motovario (motorreductores) ──
  {
    tokens: ['motovario', 'moto vario'],
    nombre: 'COMERCIAL INDUSTRIAL GARCIA,SA',
    codigo: '100025256',
    tipo: 'Motorreductores / variadores Motovario',
    categoria: 'MOTORES',
    nota: 'Proveedor habitual para equipos Motovario (motorreductores, variadores de velocidad)',
    sapKeywords: ['motor', 'reductor', 'motovario'],
    alternativas: [],
  },
]

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

function extraerSAPDeSolicitud(descripcion: string): string {
  const m = descripcion.match(/\b([5][0-9]{8})\b/)
  return m ? m[1] : ''
}

// Sinónimos industriales para mejorar la búsqueda de SAPs
const SINONIMOS_INDUSTRIALES: Record<string, string[]> = {
  plantilla: ['pletina'],
  pletina: ['plantilla'],
  abrazadera: ['abraz'],
  abraz: ['abrazadera'],
  brazadera: ['abrazadera', 'abraz'],
  inox: ['inoxidable'],
  inoxidable: ['inox'],
  galvanizado: ['galv'],
  galv: ['galvanizado'],
  tornillo: ['torn'],
  tuerca: ['tuec'],
  rodamiento: ['rodto', 'rdto'],
  rodto: ['rodamiento'],
  valvula: ['val', 'vlv'],
  val: ['valvula'],
  manguera: ['mangu'],
  reductor: ['reduc'],
  contactor: ['ctactor', 'ctac'],
  electrovalvula: ['electroval'],
}

function expandirConSinonimos(tokens: string[]): string[] {
  const result = [...tokens]
  for (const t of tokens) {
    const syns = SINONIMOS_INDUSTRIALES[t] ?? []
    for (const s of syns) {
      if (!result.includes(s)) result.push(s)
    }
  }
  return result
}

// Busca SAPs relevantes. Tokens de la descripción del usuario tienen peso x15,
// keywords extra del override tienen peso x3 (evita que keywords de tubo "ganen" a pletinas).
function buscarSapsRelevantes(
  descNorm: string,
  sapHistorico: SapRow[],
  proveedorCodigo?: string,
  extraKeywords: string[] = [],
  maxResults = 5
): Array<{ codigo: string; descripcion: string; proveedor: string }> {
  const descBaseTokens = descNorm.split(/\s+/).filter((t) => t.length >= 3)
  const descTokens = expandirConSinonimos(
    descBaseTokens.filter((t, i, arr) => arr.indexOf(t) === i)
  )

  const extraTokens = extraKeywords
    .map(norm)
    .filter((k) => k.length >= 3 && !descTokens.includes(k))
    .filter((t, i, arr) => arr.indexOf(t) === i)

  if (descTokens.length === 0 && extraTokens.length === 0) return []

  return sapHistorico
    .filter((s) => !esSapGenerico(s['Código SAP']))
    .map((s) => {
      const d = norm(s['Descripción Material'])
      const descMatches = descTokens.filter((t) => d.includes(t)).length
      const extraMatches = extraTokens.filter((t) => d.includes(t)).length
      const provBonus = proveedorCodigo && s['Cód. Proveedor PRINCIPAL'] === proveedorCodigo ? 4 : 0
      const freq = Math.log(Number(s['Veces Comprado']) + 1)
      return { sap: s, score: descMatches * 15 + extraMatches * 3 + provBonus + freq }
    })
    .filter(({ score }) => score >= 15)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ sap }) => ({
      codigo: sap['Código SAP'],
      descripcion: sap['Descripción Material'],
      proveedor: sap['Nombre Proveedor PRINCIPAL'],
    }))
}

// PASO 1: Detectar MARCA en MARCAS_A_PROVEEDOR
function paso1Marca(descNorm: string, marcas: MarcaRow[]): { marcaRow: MarcaRow; marcaDetectada: string } | null {
  for (const row of marcas) {
    const marcaNorm = norm(row['Marca / Familia'])
    if (!marcaNorm) continue
    const variantes = marcaNorm
      .split(/[\/\(\s]+/)
      .map((v) => v.trim())
      .filter((v) => v.length >= 3)
    for (const v of variantes) {
      const regex = new RegExp(`(?:^|\\s|-)${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|-|$|\\d)`)
      if (descNorm.includes(v) || regex.test(descNorm)) {
        return { marcaRow: row, marcaDetectada: row['Marca / Familia'] }
      }
    }
  }
  return null
}

// Matching de keyword con protección contra falsos positivos en tokens cortos/numéricos
function kwMatch(kw: string, desc: string): boolean {
  if (kw.length >= 6 && !/[0-9]/.test(kw)) {
    return desc.includes(kw)
  }
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?<![0-9] )(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`)
  return re.test(desc)
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
      if (kwMatch(kw, descNorm)) score++
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

  // PASO 3 (prioritario cuando hay SAP explícito en la solicitud)
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

  // Comprueba si un token (que puede ser multi-palabra) aparece en la descripción.
  // Para multi-palabra: todos los sub-tokens deben estar presentes (no importa el orden/distancia).
  function tokenEnDesc(token: string, desc: string): boolean {
    const palabras = token.split(/\s+/).filter((w) => w.length >= 3)
    if (palabras.length <= 1) return desc.includes(token)
    return palabras.every((w) => desc.includes(w))
  }

  // PASO 0: Overrides por material/marca con proveedor conocido (orden importa: específico → genérico)
  for (const override of MARCAS_OVERRIDE) {
    if (override.tokens.some((t) => tokenEnDesc(t, descNorm))) {
      pasoDeterminante = 1
      marcaDetectada = override.tokens[0].charAt(0).toUpperCase() + override.tokens[0].slice(1)
      tipoMaterial = override.tipo
      categoria = override.categoria
      principal = { nombre: override.nombre, codigo: override.codigo, nota: override.nota }

      // Alternativas hardcodeadas del override (aplicar equivalencias)
      alternativas = override.alternativas.map((a) => {
        const eq = aplicarEquivalencia(a.codigo, a.nombre)
        return { nombre: eq.nombre, codigo: eq.codigo, nota: a.nota }
      })

      // SAPs con scoring multi-token: usa tokens de la descripción + keywords del override
      sapsSugeridos = buscarSapsRelevantes(descNorm, db.sapHistorico, override.codigo, override.sapKeywords, 5)

      return { pasoDeterminante, tipoMaterial, categoria, marcaDetectada, sapEnSolicitud, principal, alternativas, sapsSugeridos, candidatoCentralizar, notasSap, notasGuia }
    }
  }

  // PASO 1: Marca en MARCAS_A_PROVEEDOR
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

    // SAPs con scoring multi-token
    sapsSugeridos = buscarSapsRelevantes(descNorm, db.sapHistorico, provPrincipal.codigo, [norm(marcaDetectada)], 5)

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

    // SAPs con scoring multi-token: usa la descripción del usuario + keywords de la guía
    const guiaKeywords = (guiaRow['Palabras clave de detección'] ?? '').split(',').map((k) => norm(k.trim())).filter((k) => k.length >= 3)
    sapsSugeridos = buscarSapsRelevantes(descNorm, db.sapHistorico, principal.codigo, guiaKeywords, 5)

    return { pasoDeterminante, tipoMaterial, categoria, marcaDetectada, sapEnSolicitud, principal, alternativas, sapsSugeridos, candidatoCentralizar, notasSap, notasGuia }
  }

  // PASO 4: Fallback por categoría genérica
  const categoriaInferida = inferirCategoria(descNorm)
  if (categoriaInferida) {
    categoria = categoriaInferida
    tipoMaterial = categoriaInferida
    pasoDeterminante = 4
    const provsFallback = paso4Categoria(categoriaInferida, db.proveedores)
    if (provsFallback.length > 0) {
      principal = normalizarProveedor(provsFallback[0]['Código Proveedor'], provsFallback[0]['Nombre Proveedor'])
      alternativas = provsFallback.slice(1).map((p) => normalizarProveedor(p['Código Proveedor'], p['Nombre Proveedor']))
      sapsSugeridos = buscarSapsRelevantes(descNorm, db.sapHistorico, principal.codigo, [], 4)
    }
  }

  // PASO 5: Sin match — pedir aclaración
  if (!principal) {
    pasoDeterminante = 5
  }

  return { pasoDeterminante, tipoMaterial, categoria, marcaDetectada, sapEnSolicitud, principal, alternativas, sapsSugeridos, candidatoCentralizar, notasSap, notasGuia }
}

function inferirCategoria(descNorm: string): string {
  const mapaCategorias: Array<{ keywords: string[]; categoria: string }> = [
    { keywords: ['rodamiento', 'cojinete', 'bearing'], categoria: 'RODAMIENTOS' },
    { keywords: ['banda', 'correa transportadora', 'conveyor'], categoria: 'BANDAS TRANSPORTADORAS' },
    { keywords: ['motoreductor', 'motorreductor', 'reductor', 'motovario', 'motor electrico', 'motor trifasico'], categoria: 'MOTORES' },
    { keywords: ['contactor', 'rele', 'magnetotermico', 'disyuntor', 'interruptor', 'pulsador', 'variador', 'inverter', 'servo'], categoria: 'ELECTRICIDAD / AUTOMATIZACIÓN' },
    { keywords: ['sensor', 'detector', 'encoder', 'fotocelula', 'fotocélula'], categoria: 'ELECTRICIDAD / AUTOMATIZACIÓN' },
    { keywords: ['cable', 'manguera electrica', 'hilo electrico'], categoria: 'ELECTRICIDAD / AUTOMATIZACIÓN' },
    { keywords: ['bomba', 'centrifuga', 'peristaltica'], categoria: 'BOMBAS' },
    { keywords: ['neumatica', 'cilindro', 'valvula neumatica', 'compresor'], categoria: 'NEUMÁTICA' },
    { keywords: ['hidraulica', 'latiguillo', 'manguito hidraulico'], categoria: 'HIDRÁULICA' },
    { keywords: ['tornillo', 'tuerca', 'arandela', 'ferreteria', 'perno', 'hexagonal'], categoria: 'FERRETERÍA' },
    { keywords: ['cadena', 'piñon', 'sprocket', 'rexnord'], categoria: 'TRANSMISIÓN MECÁNICA' },
    { keywords: ['lubricante', 'aceite', 'grasa'], categoria: 'LUBRICANTES' },
    { keywords: ['etiqueta', 'marcaje', 'impresora', 'tinta', 'ribbon'], categoria: 'MARCAJE' },
    { keywords: ['valvula bola', 'valvula', 'purgador'], categoria: 'VÁLVULAS' },
    { keywords: ['junta', 'reten', 'o-ring', 'viton', 'nbr', 'epdm'], categoria: 'HIDRÁULICA / JUNTAS' },
    { keywords: ['tubo pvc', 'pvc', 'fontaneria', 'grifo'], categoria: 'FONTANERÍA / PVC' },
  ]

  for (const entry of mapaCategorias) {
    if (entry.keywords.some((kw) => descNorm.includes(kw))) {
      return entry.categoria
    }
  }
  return ''
}
