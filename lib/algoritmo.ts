import type { MarcaRow, GuiaRow, SapRow, ProveedorRow, DbData } from './dbLoader'

export interface CandidatoProveedor {
  nombre: string
  codigo: string
  nota?: string
}

export interface SapSugerido {
  codigo: string
  descripcion: string
  proveedor: string
  aproximado?: boolean   // true si la medida NO coincide exactamente con lo pedido
  notaMedida?: string    // p.ej. "medida pedida 15x15; SAP 20x20 — verificar"
}

export interface ResultadoAlgoritmo {
  pasoDeterminante: 1 | 2 | 3 | 4 | 5
  tipoMaterial: string
  categoria: string
  marcaDetectada: string
  sapEnSolicitud: string
  principal: CandidatoProveedor | null
  alternativas: CandidatoProveedor[]
  sapsSugeridos: SapSugerido[]
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
// ORDEN CRÍTICO: los más específicos van PRIMERO.
//   1) HERRAMIENTAS (vaso, llave, carraca...) -> antes que tornillería/inox
//   2) MARCAS específicas (genebre, hofma, inoxpa, karcher...)
//   3) INOX sub-tipos (chapa, malla, calderería, din11851...)
//   4) INOX genérico (fallback)
const MARCAS_OVERRIDE: Array<{
  tokens: string[]
  nombre: string
  codigo: string
  tipo: string
  categoria: string
  nota: string
  sapKeywords: string[]
  alternativas: Array<{ nombre: string; codigo: string; nota?: string }>
  // Si true, NO se aplica el filtro dimensional estricto (p.ej. herramientas medidas en "del 13")
  ignorarFiltroMedidas?: boolean
  // Si true (solo inox genérico), el proveedor principal se toma del SAP candidato más fuerte
  // en vez de forzar el del override. Útil porque el inox lo sirven varios proveedores.
  inferirProveedorDeSap?: boolean
}> = [
  // ────────────────────────────────────────────────────────────────────
  // HERRAMIENTA MANUAL  (vaso, llave, carraca...) — PRIORIDAD MÁXIMA
  // Evita que "vaso hexagonal del 13" caiga en tornillería/inox por la palabra "hexagonal".
  // ────────────────────────────────────────────────────────────────────
  {
    tokens: [
      'vaso hexagonal', 'vaso hex', 'llave de vaso', 'llave vaso', 'vaso de',
      'carraca', 'trinquete', 'llave fija', 'llave allen', 'llave inglesa',
      'destornillador', 'punta de vaso', 'juego de vasos', 'vaso impacto',
    ],
    nombre: 'COMERCIAL INDUSTRIAL GARCIA,SA',
    codigo: '100025256',
    tipo: 'Herramienta manual (llave de vaso / vasos)',
    categoria: 'HERRAMIENTA MANUAL',
    nota: 'Llave de vaso / herramienta manual de mano. NO es tornillería.',
    sapKeywords: ['llave de vaso', 'vaso', 'carraca', 'mm', 'pulgada'],
    alternativas: [
      { nombre: 'MAQ. Y HERRAM. DEL SURESTE', codigo: '100025249' },
      { nombre: 'FERRETERIA DEL SEGURA', codigo: '100025134' },
    ],
    ignorarFiltroMedidas: true,
  },

  // ────────────────────────────────────────────────────────────────────
  // KARCHER — aunque diga "manguera", lo llevan CIG / Ferretería del Segura
  // ────────────────────────────────────────────────────────────────────
  {
    tokens: ['karcher', 'kärcher'],
    nombre: 'COMERCIAL INDUSTRIAL GARCIA,SA',
    codigo: '100025256',
    tipo: 'Material / accesorios KARCHER',
    categoria: 'KARCHER',
    nota: 'Material marca KARCHER (mangueras, accesorios, repuestos): proveedor habitual CIG; Ferretería del Segura como alternativa.',
    sapKeywords: ['karcher', 'manguera', 'lanza', 'boquilla'],
    alternativas: [
      { nombre: 'FERRETERIA DEL SEGURA', codigo: '100025134' },
    ],
  },

  // ── MARCAS con proveedor específico que pueden contener "inox" en la descripción ──
  {
    tokens: ['genebre', 'valvula bola'],
    nombre: 'PONTONES GUILLAMÓN,SL.',
    codigo: '100033923',
    tipo: 'Válvulas bola GENEBRE / inox',
    categoria: 'VÁLVULAS',
    nota: 'PONTONES GUILLAMÓN: distribuidor principal GENEBRE. Válvulas bola inox, BSP, con o sin manómetro.',
    sapKeywords: ['valvula bola', 'val bola', 'genebre', 'bola inox'],
    alternativas: [
      { nombre: 'COMERCIAL INDUSTRIAL GARCIA,SA', codigo: '100025256', nota: 'CIG: alternativa válvulas bola inox' },
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

  // ── INOX sub-tipos específicos (ANTES del override genérico de inox) ──

  // Chapa inox: estándar la sirven proveedores de material inox (EFIX/CIG);
  // sólo el corte láser / pliego a medida va a MAQUISUR.
  {
    tokens: ['chapa inox', 'laser inox', 'plancha inox', 'corte inox', 'fabricar chapa inox', 'lamina inox', 'pliego chapa', 'pliego inox', 'chapa a medida'],
    nombre: 'MAQUISUR 1999, S.L.U.',
    codigo: '100031455',
    tipo: 'Chapa inox a medida / corte láser',
    categoria: 'MATERIAL METÁLICO',
    nota: 'Chapa inox a medida / corte láser: MAQUISUR. Para chapa estándar comercial puede servirla también un proveedor de material inox (EFIX / CIG).',
    sapKeywords: ['chapa inox', 'chapa', 'plancha inox', 'lamina inox'],
    alternativas: [
      { nombre: 'EFIX', codigo: '100034920', nota: 'Chapa inox estándar / comercial' },
      { nombre: 'COMERCIAL INDUSTRIAL GARCIA,SA', codigo: '100025256', nota: 'Chapa inox estándar / comercial' },
      { nombre: 'TROQUELAJES YAGUES', codigo: '100034033', nota: 'Troquelaje y chapa prelacada / puertas' },
    ],
  },

  {
    tokens: ['malla inox', 'mallas inox', 'rejilla', 'electrosoldada', 'reja inox', 'malla electros'],
    nombre: 'MALLAS INOX CASTELLON',
    codigo: '100034393',
    tipo: 'Mallas / rejillas inox',
    categoria: 'MATERIAL METÁLICO',
    nota: 'Mallas Inox Castellón: proveedor directo para mallas, rejillas y redes inox industriales (electrosoldadas).',
    sapKeywords: ['malla', 'rejilla', 'electrosoldada', 'red inox', 'malla inox'],
    alternativas: [
      { nombre: 'EFIX', codigo: '100034920', nota: 'Material inox general' },
    ],
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
      { nombre: 'EFIX', codigo: '100034920', nota: 'Tubería y accesorios inox de conexión' },
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
      { nombre: 'EFIX', codigo: '100034920', nota: 'También suministra racores DIN 11851' },
    ],
  },

  // ── INOX GENÉRICO (fallback) ──
  // Punteras, varillas, perfiles, tubos, codos, machones, bridas inox de soldar.
  {
    tokens: ['inox', 'inoxidable', 'acero inox', 'acero inoxidable', 'a-316', 'a-304', 'sch-10', 'sch-40', 'aisi 316', 'aisi 304', 'aisi316', 'aisi304'],
    nombre: 'EFIX',
    codigo: '100034920',
    tipo: 'Material inoxidable / acero inox',
    categoria: 'INOX / FONTANERÍA',
    nota: 'EFIX: proveedor principal para tubería inox, accesorios de soldar, perfiles, punteras, varillas y tornillería inox alimentaria.',
    sapKeywords: ['inox', 'inoxidable', 'a-316', 'a-304', 'sch-10', 'aisi'],
    alternativas: [
      { nombre: 'COMERCIAL INDUSTRIAL GARCIA,SA', codigo: '100025256', nota: 'Válvulas, perfiles y accesorios inox generales' },
    ],
    inferirProveedorDeSap: true,
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
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s\/\-\.\"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ════════════════════════════════════════════════════════════════════════
//  NUEVO: EXTRACCIÓN Y COMPARACIÓN DE MEDIDAS
//  Resuelve PROBLEMA 2 (1" no puede devolver 1 1/2" ni 1/4")
// ════════════════════════════════════════════════════════════════════════

interface Medidas {
  pulgadas: string[]   // p.ej. ["1", "1 1/2", "1/4"] normalizadas
  mm: number[]         // diámetros / espesores en mm
  sch: string[]        // SCH-10, SCH-40
  dn: string[]         // DN50, NW50
  seccion: number[]    // dimensiones de sección tipo AxBxC (15,15,1.5) ordenadas desc
}

// Convierte una fracción en pulgadas a número decimal: "1 1/2" -> 1.5, "1/4" -> 0.25
function pulgadaADecimal(p: string): number {
  const t = p.trim()
  // mixto: "1 1/2"
  const mixto = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixto) return Number(mixto[1]) + Number(mixto[2]) / Number(mixto[3])
  // fracción simple: "1/2"
  const frac = t.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  // entero o decimal: "1", "1.5"
  const dec = t.match(/^(\d+(?:[\.,]\d+)?)$/)
  if (dec) return Number(dec[1].replace(',', '.'))
  return NaN
}

// Extrae medidas de un texto (ya normalizado o crudo).
function extraerMedidas(texto: string): Medidas {
  const original = (texto ?? '').toLowerCase().replace(',', '.')
  const pulgadas: string[] = []
  const mm: number[] = []
  const sch: string[] = []
  const dn: string[] = []

  // SCH primero, y lo retiramos del texto para que su número no contamine las pulgadas
  const reSch = /sch[\s\-]?(\d{1,3})/g
  let m: RegExpExecArray | null
  while ((m = reSch.exec(original)) !== null) sch.push(m[1])
  const t = original.replace(/sch[\s\-]?\d{1,3}/g, ' ')

  // Pulgadas: "1 1/2"", "1/4"", "1"", "3/8 pulg". Exige que no haya un dígito pegado a la izquierda.
  const reInch = /(?<![\d.])(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(?:"|''|pulg|pulgada|pulgadas|in\b)/g
  while ((m = reInch.exec(t)) !== null) {
    const dec = pulgadaADecimal(m[1].trim())
    if (!isNaN(dec)) pulgadas.push(dec.toFixed(4))
  }

  // DN / NW
  const reDn = /\b(?:dn|nw)[\s\-]?(\d{1,4})/g
  while ((m = reDn.exec(t)) !== null) dn.push(m[1])

  // mm: "d.28", "28x1 mm", "ø6mm", "espesor 1.5 mm"
  const reMm = /(?:ø|o\.|d\.?\s*)?(\d+(?:\.\d+)?)\s*mm\b/g
  while ((m = reMm.exec(t)) !== null) mm.push(Number(m[1]))
  const reDiam = /ø\s*(\d+(?:\.\d+)?)/g
  while ((m = reDiam.exec(t)) !== null) mm.push(Number(m[1]))

  // Sección tipo AxB o AxBxC: "15x15x1.5", "60x40x2", "100x12"
  const seccion: number[] = []
  const reSec = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?/g
  while ((m = reSec.exec(t)) !== null) {
    const nums = [m[1], m[2], m[3]].filter(Boolean).map(Number)
    for (const n of nums) seccion.push(n)  // NO deduplicar: 15x15 tiene dos 15 legítimos
  }
  seccion.sort((a, b) => b - a) // mayor primero

  return {
    pulgadas: [...new Set(pulgadas)],
    mm: [...new Set(mm)],
    sch: [...new Set(sch)],
    dn: [...new Set(dn)],
    seccion,
  }
}

// Devuelve true si las medidas del SAP candidato son COMPATIBLES con las pedidas.
// Regla: si la solicitud especifica pulgadas y el candidato también especifica pulgadas,
// alguna debe coincidir; si no coincide ninguna -> INCOMPATIBLE (descartar).
// Igual para SCH y para diámetro mm principal. Si la solicitud no especifica una dimensión,
// no se filtra por ella (no penaliza de más).
function medidasCompatibles(pedidas: Medidas, candidata: Medidas): boolean {
  // Pulgadas
  if (pedidas.pulgadas.length > 0 && candidata.pulgadas.length > 0) {
    const hayCoincidencia = pedidas.pulgadas.some((p) => candidata.pulgadas.includes(p))
    if (!hayCoincidencia) return false
  }
  // SCH
  if (pedidas.sch.length > 0 && candidata.sch.length > 0) {
    const hay = pedidas.sch.some((s) => candidata.sch.includes(s))
    if (!hay) return false
  }
  // DN / NW
  if (pedidas.dn.length > 0 && candidata.dn.length > 0) {
    const hay = pedidas.dn.some((d) => candidata.dn.includes(d))
    if (!hay) return false
  }
  // mm: comparamos el conjunto; si pide mm concretos y el candidato tiene mm pero ninguno coincide -> fuera
  if (pedidas.mm.length > 0 && candidata.mm.length > 0) {
    const hay = pedidas.mm.some((x) => candidata.mm.some((y) => Math.abs(x - y) < 0.01))
    if (!hay) return false
  }
  // Sección AxBxC: las DOS dimensiones mayores (sección principal) deben coincidir.
  // Así 15x15x1.5 NO es compatible con 20x20x1.5 ni con 60x40x2 (espesor igual no basta).
  if (pedidas.seccion.length >= 2 && candidata.seccion.length >= 2) {
    const pA = pedidas.seccion[0], pB = pedidas.seccion[1]
    const cA = candidata.seccion[0], cB = candidata.seccion[1]
    const coincide = Math.abs(pA - cA) < 0.01 && Math.abs(pB - cB) < 0.01
    if (!coincide) return false
  }
  return true
}

// ════════════════════════════════════════════════════════════════════════
//  NUEVO: BÚSQUEDA SAP "ESTILO COMPRADOR" (tokens abreviados)
//  Resuelve PROBLEMA 1 y PROBLEMA 6
//  De "chapa inox 2000x1000x1,5 inox 304" -> ["chapa","inox","2000","1000"]
// ════════════════════════════════════════════════════════════════════════

// Palabras de ruido que un comprador NO teclea al buscar en SAP.
const RUIDO = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'por', 'una', 'uno',
  'unidad', 'unidades', 'ud', 'uds', 'pza', 'pzas', 'pieza', 'piezas',
  'tipo', 'medida', 'medidas', 'aprox', 'ref', 'referencia', 'marca',
])

// Sustantivos industriales relevantes que SIEMPRE deben conservarse si aparecen.
const SUSTANTIVOS_CLAVE = [
  'chapa', 'plancha', 'lamina', 'tubo', 'tuberia', 'codo', 'machon', 'puntera',
  'brida', 'varilla', 'perfil', 'angulo', 'pletina', 'plantilla', 'malla', 'rejilla',
  'valvula', 'racor', 'abrazadera',
  'cuadrado', 'rectangular', 'redondo', 'electrosoldada',
  'rodamiento', 'cojinete', 'correa', 'banda', 'cadena', 'pinon', 'motor', 'reductor',
  'bomba', 'cilindro', 'sensor', 'cable', 'manguera', 'junta', 'reten', 'llave', 'vaso',
  'tornillo', 'tuerca', 'arandela', 'esparrago', 'inox', 'inoxidable', 'pvc',
]

// Sinónimos industriales: expande tokens del comprador a como aparecen en SAP.
// Ej: "plantilla" → también busca "pletina" porque las SAPs usan esa abreviatura.
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

// Genera los tokens de búsqueda abreviada al estilo de un comprador.
// - conserva sustantivo(s) industrial(es) + "inox"
// - conserva como mucho las 2 primeras dimensiones grandes (>=3 cifras: 2000, 1000)
// - descarta espesores secundarios (1.5, 304 como sufijo de aleación si ya hay otra dim)
// - quita ruido y unidades
function tokensBusquedaSap(descNorm: string): string[] {
  // separa medidas tipo 2000x1000x1.5 en tokens individuales,
  // pero SOLO la "x" que está entre dígitos (para no romper "inox")
  const limpio = descNorm
    .replace(/(\d)\s*[x×]\s*(\d)/g, '$1 $2')
    .replace(/[,]/g, '.')

  const crudos = limpio.split(/\s+/).filter(Boolean)

  const palabras: string[] = []
  const numerosGrandes: string[] = []  // >=3 cifras (dimensiones principales: 2000,1000)
  const numerosPeq: string[] = []      // 1-2 cifras (espesores, aleaciones)

  for (const tk of crudos) {
    if (RUIDO.has(tk)) continue
    if (/^\d+(\.\d+)?$/.test(tk)) {
      const entero = tk.split('.')[0]
      if (entero.length >= 3) numerosGrandes.push(entero)
      else numerosPeq.push(tk)
      continue
    }
    if (tk.length >= 3) palabras.push(tk)
  }

  // Prioriza sustantivos clave + resto de palabras (sin duplicar)
  const claves = palabras.filter((p) => SUSTANTIVOS_CLAVE.includes(p))
  const otras = palabras.filter((p) => !SUSTANTIVOS_CLAVE.includes(p))

  const tokens: string[] = []
  for (const p of [...claves, ...otras]) if (!tokens.includes(p)) tokens.push(p)

  // Añade como mucho 2 dimensiones grandes (las que un comprador teclea: 2000 1000)
  for (const n of numerosGrandes.slice(0, 2)) if (!tokens.includes(n)) tokens.push(n)

  // Si NO hay dimensiones grandes, deja entrar 1 número pequeño relevante (ej. "del 13")
  if (numerosGrandes.length === 0 && numerosPeq.length > 0) {
    const n = numerosPeq[0]
    if (!tokens.includes(n)) tokens.push(n)
  }

  return tokens
}

// ── Filtro por TIPO DE PIEZA: una varilla/puntera no debe devolver tubos, etc.
// Detecta el sustantivo principal de la pieza. Si la solicitud pide uno concreto,
// se descartan candidatos cuyo sustantivo principal sea de OTRA familia incompatible.
const FAMILIAS_PIEZA: Array<{ familia: string; tokens: string[] }> = [
  { familia: 'tubo',      tokens: ['tubo', 'tuberia'] },
  { familia: 'anillo_seg', tokens: ['arillo', 'aro seg', 'anillo seg', 'aro de seg', 'anillo de seg', 'circlip', 'seeger'] },
  { familia: 'varilla',   tokens: ['varilla', 'redondo macizo', 'barra macizo'] },
  { familia: 'puntera',   tokens: ['puntera'] },
  { familia: 'codo',      tokens: ['codo'] },
  { familia: 'brida',     tokens: ['brida'] },
  { familia: 'machon',    tokens: ['machon', 'machón'] },
  { familia: 'chapa',     tokens: ['chapa', 'plancha', 'lamina'] },
  { familia: 'perfil',    tokens: ['perfil', 'angulo', 'pletina', 'plantilla'] },
  { familia: 'valvula',   tokens: ['valvula', 'válvula'] },
  { familia: 'malla',     tokens: ['malla', 'rejilla', 'electrosoldada', 'red inox'] },
  { familia: 'racor',     tokens: ['racor', 'abrazadera'] },
  { familia: 'tornilleria', tokens: ['tornillo', 'tuerca', 'arandela', 'esparrago', 'allen', 'd-933', 'd-912', 'd-934'] },
  { familia: 'llave',     tokens: ['llave de vaso', 'vaso', 'carraca', 'llave'] },
]

function detectarFamilia(texto: string): string | null {
  const t = norm(texto)
  for (const f of FAMILIAS_PIEZA) {
    if (f.tokens.some((tk) => t.includes(tk))) return f.familia
  }
  return null
}

// Familias que NO deben mezclarse entre sí (cada una es excluyente del resto cuando se piden por nombre).
function familiasIncompatibles(pedida: string | null, candidata: string | null): boolean {
  if (!pedida || !candidata) return false
  return pedida !== candidata
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

// Describe en texto la medida pedida y la del SAP, para la nota de "aproximado".
function describirMedida(m: Medidas): string {
  const partes: string[] = []
  if (m.seccion.length >= 2) partes.push(m.seccion.join('x'))
  if (m.pulgadas.length) partes.push(m.pulgadas.map((p) => `${parseFloat(p)}"`).join('/'))
  if (m.sch.length) partes.push('SCH-' + m.sch.join('/'))
  if (m.dn.length) partes.push('DN' + m.dn.join('/'))
  if (m.mm.length && m.seccion.length < 2) partes.push(m.mm.join('x') + ' mm')
  return partes.join(' ')
}

// ════════════════════════════════════════════════════════════════════════
//  BÚSQUEDA SAP RELEVANTE (dos pasadas: EXACTOS y, si faltan, APROXIMADOS)
//  - usa tokens abreviados estilo comprador + VARIANTES generadas por la IA
//    (ej. "ari seg 25", "aro seg 25", "anillo seg 25") para cubrir cómo está
//    codificado el material en SAP (arillo / aro / anillo...)
//  - exactos = misma medida; aproximados = misma familia, otra medida (marcados ~)
//  - NUNCA deja un material sin candidato si existe algo de la misma familia
// ════════════════════════════════════════════════════════════════════════
function buscarSapsRelevantes(
  descNorm: string,
  sapHistorico: SapRow[],
  proveedorCodigo?: string,
  extraKeywords: string[] = [],
  maxResults = 5,
  opciones: { aplicarFiltroMedidas?: boolean; variantes?: string[] } = {}
): SapSugerido[] {
  const aplicarFiltroMedidas = opciones.aplicarFiltroMedidas !== false

  // Tokens base (de la descripción) + expansión de sinónimos + keywords del override/guía
  const baseTokens = tokensBusquedaSap(descNorm)
  const baseConSinonimos = expandirConSinonimos(baseTokens)
  const tokens = [...baseConSinonimos, ...extraKeywords.map(norm)]
    .filter((t) => t && t.length >= 2)
    .filter((t, i, arr) => arr.indexOf(t) === i)

  // VARIANTES IA: cada una es una "consulta SAP" tipo "ari seg 25".
  // Convertimos cada variante en su propio set de tokens. Un SAP que case con
  // CUALQUIER variante entera puntúa fuerte (es como teclearla en SAP).
  const variantesTokens: string[][] = (opciones.variantes ?? [])
    .map((v) => norm(v).split(/\s+/).filter((t) => t.length >= 2))
    .filter((arr) => arr.length > 0)

  if (tokens.length === 0 && variantesTokens.length === 0) return []

  const medidasPedidas = extraerMedidas(descNorm)
  const descMedida = describirMedida(medidasPedidas)
  const haySolicitudConMedida =
    medidasPedidas.pulgadas.length > 0 ||
    medidasPedidas.sch.length > 0 ||
    medidasPedidas.dn.length > 0 ||
    medidasPedidas.mm.length > 0 ||
    medidasPedidas.seccion.length >= 2

  const familiaPedida = detectarFamilia(descNorm)

  const puntuados = sapHistorico
    .filter((s) => !esSapGenerico(s['Código SAP']))
    .filter((s) => {
      if (familiaPedida) {
        const familiaCand = detectarFamilia(s['Descripción Material'])
        if (familiasIncompatibles(familiaPedida, familiaCand)) return false
      }
      return true
    })
    .map((s) => {
      const d = norm(s['Descripción Material'])
      const tokenMatches = tokens.filter((t) => d.includes(t)).length

      // Coincidencia por variante: cuántos tokens de la variante están en el SAP.
      // La MEJOR variante (la que más casa) define el bonus. Si una variante casa
      // entera, es señal fortísima de que es el material correcto.
      let mejorVariante = 0
      for (const vt of variantesTokens) {
        const hits = vt.filter((t) => d.includes(t)).length
        const ratio = hits / vt.length
        const puntos = hits * 8 + (ratio >= 0.99 ? 12 : 0) // variante completa => +12
        if (puntos > mejorVariante) mejorVariante = puntos
      }

      const provBonus = proveedorCodigo && s['Cód. Proveedor PRINCIPAL'] === proveedorCodigo ? 4 : 0
      const freq = Math.log(Number(s['Veces Comprado']) + 1)
      const medidasCand = extraerMedidas(s['Descripción Material'])
      const exacto = !haySolicitudConMedida || !aplicarFiltroMedidas
        ? true
        : medidasCompatibles(medidasPedidas, medidasCand)
      const medidaBonus = exacto && haySolicitudConMedida ? 8 : 0

      const score = tokenMatches * 10 + mejorVariante + provBonus + freq + medidaBonus
      // Un SAP entra si casa por tokens de la descripción O por alguna variante IA.
      const relevante = tokenMatches >= 1 || mejorVariante >= 8
      return { sap: s, relevante, exacto, medidasCand, score }
    })
    .filter(({ relevante }) => relevante)
    .sort((a, b) => b.score - a.score)

  const exactos = puntuados.filter((p) => p.exacto)
  const aproximados = puntuados.filter((p) => !p.exacto)

  const salida: SapSugerido[] = []

  // 1) Exactos primero (sin marca)
  for (const p of exactos.slice(0, maxResults)) {
    salida.push({
      codigo: p.sap['Código SAP'],
      descripcion: p.sap['Descripción Material'],
      proveedor: p.sap['Nombre Proveedor PRINCIPAL'],
    })
  }

  // 2) Si no hay exactos (o faltan), rellena con aproximados MARCADOS
  if (salida.length < maxResults) {
    for (const p of aproximados.slice(0, maxResults - salida.length)) {
      const medCand = describirMedida(p.medidasCand)
      const nota = haySolicitudConMedida && descMedida
        ? `Medida no exacta: pedido ${descMedida}${medCand ? `, SAP ${medCand}` : ''}. Verificar/cambiar con proveedor.`
        : 'Coincidencia aproximada — verificar con proveedor.'
      salida.push({
        codigo: p.sap['Código SAP'],
        descripcion: p.sap['Descripción Material'],
        proveedor: p.sap['Nombre Proveedor PRINCIPAL'],
        aproximado: true,
        notaMedida: nota,
      })
    }
  }

  return salida
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

export function ejecutarAlgoritmo(descripcion: string, db: DbData, variantesBusqueda: string[] = []): ResultadoAlgoritmo {
  const descNorm = norm(descripcion)
  const sapEnSolicitud = extraerSAPDeSolicitud(descripcion)

  let pasoDeterminante: 1 | 2 | 3 | 4 | 5 = 5
  let tipoMaterial = 'No clasificado'
  let categoria = ''
  let marcaDetectada = 'no especificada'
  let principal: CandidatoProveedor | null = null
  let alternativas: CandidatoProveedor[] = []
  let sapsSugeridos: SapSugerido[] = []
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

  // Comprueba un token (posiblemente multi-palabra) contra la descripción.
  // Para tokens con varias palabras: basta con que TODAS estén presentes en la desc
  // (no importa la distancia ni el orden). Así "abrazadera inox" casa con "abrazadera 32mm inox".
  function tokenEnDesc(token: string, desc: string): boolean {
    const palabras = token.split(/\s+/).filter((w) => w.length >= 3)
    if (palabras.length <= 1) return desc.includes(token)
    return palabras.every((w) => desc.includes(w))
  }

  // PASO 0: Overrides por material/marca (orden importa: herramienta → marca → inox sub-tipo → inox genérico)
  for (const override of MARCAS_OVERRIDE) {
    if (override.tokens.some((t) => tokenEnDesc(t, descNorm))) {
      pasoDeterminante = 1
      marcaDetectada = override.tokens[0].charAt(0).toUpperCase() + override.tokens[0].slice(1)
      tipoMaterial = override.tipo
      categoria = override.categoria
      principal = { nombre: override.nombre, codigo: override.codigo, nota: override.nota }

      alternativas = override.alternativas.map((a) => {
        const eq = aplicarEquivalencia(a.codigo, a.nombre)
        return { nombre: eq.nombre, codigo: eq.codigo, nota: a.nota }
      })

      // SAPs con búsqueda abreviada + filtro dimensional (salvo herramientas tipo "del 13")
      sapsSugeridos = buscarSapsRelevantes(
        descNorm,
        db.sapHistorico,
        override.codigo,
        override.sapKeywords,
        5,
        { aplicarFiltroMedidas: !override.ignorarFiltroMedidas, variantes: variantesBusqueda }
      )

      // En inox genérico: si hay un SAP candidato EXACTO, el proveedor principal se toma
      // de ese SAP (lo sirven varios proveedores). El override pasa a alternativa.
      if (override.inferirProveedorDeSap && sapsSugeridos.length > 0) {
        const primerExacto = sapsSugeridos.find((s) => !s.aproximado) || sapsSugeridos[0]
        const provRow = db.proveedores.find((p) => norm(p['Nombre Proveedor']) === norm(primerExacto.proveedor))
        let provInferido: CandidatoProveedor
        if (provRow) {
          provInferido = normalizarProveedor(provRow['Código Proveedor'], provRow['Nombre Proveedor'])
        } else {
          // No está en tabla proveedores: usamos nombre del SAP + equivalencia por nombre
          const eq = aplicarEquivalencia('', primerExacto.proveedor)
          provInferido = { codigo: eq.codigo, nombre: eq.nombre || primerExacto.proveedor }
        }
        if (provInferido.codigo && provInferido.codigo !== principal.codigo) {
          // El override actual baja a alternativa (si no estaba ya)
          if (!alternativas.some((a) => a.codigo === principal!.codigo)) {
            alternativas = [{ nombre: principal.nombre, codigo: principal.codigo }, ...alternativas]
          }
          principal = provInferido
        }
        // Quitar de alternativas el que ahora es principal
        alternativas = alternativas.filter((a) => a.codigo !== principal!.codigo)
      }

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

    sapsSugeridos = buscarSapsRelevantes(descNorm, db.sapHistorico, provPrincipal.codigo, [norm(marcaDetectada)], 5, { variantes: variantesBusqueda })

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

    const guiaKeywords = (guiaRow['Palabras clave de detección'] ?? '').split(',').map((k) => norm(k.trim())).filter((k) => k.length >= 3)
    sapsSugeridos = buscarSapsRelevantes(descNorm, db.sapHistorico, principal.codigo, guiaKeywords, 5, { variantes: variantesBusqueda })

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
      sapsSugeridos = buscarSapsRelevantes(descNorm, db.sapHistorico, principal.codigo, [], 4, { variantes: variantesBusqueda })
    }
  }

  // PASO 5: Sin match de proveedor — pedir aclaración.
  // Aun así, si la IA dio variantes, intentamos encontrar SAPs parecidos para
  // que el usuario al menos tenga códigos candidatos que aceptar.
  if (!principal) {
    pasoDeterminante = 5
    if (sapsSugeridos.length === 0 && variantesBusqueda.length > 0) {
      sapsSugeridos = buscarSapsRelevantes(descNorm, db.sapHistorico, undefined, [], 5, { variantes: variantesBusqueda })
      // Si encontramos SAPs, derivamos un proveedor candidato del más frecuente
      if (sapsSugeridos.length > 0) {
        const provNombre = sapsSugeridos[0].proveedor
        const provRow = db.proveedores.find((p) => norm(p['Nombre Proveedor']) === norm(provNombre))
        if (provRow) {
          principal = normalizarProveedor(provRow['Código Proveedor'], provRow['Nombre Proveedor'])
          tipoMaterial = tipoMaterial === 'No clasificado' ? sapsSugeridos[0].descripcion : tipoMaterial
        }
      }
    }
  }

  return { pasoDeterminante, tipoMaterial, categoria, marcaDetectada, sapEnSolicitud, principal, alternativas, sapsSugeridos, candidatoCentralizar, notasSap, notasGuia }
}

function inferirCategoria(descNorm: string): string {
  const mapaCategorias: Array<{ keywords: string[]; categoria: string }> = [
    { keywords: ['vaso hexagonal', 'llave de vaso', 'carraca', 'destornillador', 'llave fija', 'llave allen'], categoria: 'HERRAMIENTA MANUAL' },
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

// ════════════════════════════════════════════════════════════════════════
//  UNIFICACIÓN DE PEDIDO POR PROVEEDOR
//  Regla del negocio: si varios materiales son del MISMO tipo (categoría),
//  se agrupan en un solo proveedor (el mayoritario para esa categoría) para
//  no hacer 2 pedidos. El material movido se MARCA (unificado=true) con nota.
// ════════════════════════════════════════════════════════════════════════
export interface ItemPedido {
  descripcion: string
  cantidad: number
  categoria: string
  proveedorOriginal: CandidatoProveedor | null
  proveedorAsignado: CandidatoProveedor | null
  unificado: boolean          // true si se movió a otro proveedor para unificar
  notaUnificacion?: string
  sapsSugeridos?: Array<{ codigo: string; descripcion: string; proveedor: string; nota?: string; aproximado?: boolean }>
}

export function unificarPedido(items: ItemPedido[]): ItemPedido[] {
  // Agrupa por categoría. Dentro de cada categoría, elige el proveedor con más
  // líneas (mayoritario) y mueve el resto a él, marcándolos.
  const porCategoria = new Map<string, ItemPedido[]>()
  for (const it of items) {
    const cat = norm(it.categoria || 'sin-categoria')
    if (!porCategoria.has(cat)) porCategoria.set(cat, [])
    porCategoria.get(cat)!.push(it)
  }

  for (const grupo of porCategoria.values()) {
    if (grupo.length < 2) continue // nada que unificar

    // Cuenta líneas por proveedor (usando el original)
    const conteo = new Map<string, { prov: CandidatoProveedor; n: number }>()
    for (const it of grupo) {
      const p = it.proveedorOriginal
      if (!p || !p.codigo) continue
      const cur = conteo.get(p.codigo)
      if (cur) cur.n++
      else conteo.set(p.codigo, { prov: { nombre: p.nombre, codigo: p.codigo }, n: 1 })
    }
    if (conteo.size < 2) continue // todos ya van al mismo proveedor

    // Proveedor mayoritario de la categoría
    const mayoritario = [...conteo.values()].sort((a, b) => b.n - a.n)[0]
    if (!mayoritario) continue

    for (const it of grupo) {
      const orig = it.proveedorOriginal
      if (!orig || !orig.codigo) continue
      if (orig.codigo === mayoritario.prov.codigo) {
        it.proveedorAsignado = orig
        it.unificado = false
      } else {
        // Movemos al mayoritario y marcamos
        it.proveedorAsignado = { nombre: mayoritario.prov.nombre, codigo: mayoritario.prov.codigo }
        it.unificado = true
        it.notaUnificacion = `Se incluye en ${mayoritario.prov.nombre} para unificar pedido (histórico/principal: ${orig.nombre}). Confirmar que ${mayoritario.prov.nombre} puede servirlo.`
      }
    }
  }

  // Los que no se tocaron conservan su proveedor original como asignado
  for (const it of items) {
    if (!it.proveedorAsignado) {
      it.proveedorAsignado = it.proveedorOriginal
      it.unificado = false
    }
  }

  return items
}
