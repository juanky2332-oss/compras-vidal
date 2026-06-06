import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { loadDb } from '@/lib/dbLoader'
import { ejecutarAlgoritmo, unificarPedido, type ItemPedido } from '@/lib/algoritmo'
import type { Material } from '@/lib/types'

export const dynamic = 'force-dynamic'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// ════════════════════════════════════════════════════════════════════════
//  PASO PREVIO: la IA genera VARIANTES de búsqueda estilo SAP
//  Igual que un comprador: primero entiende qué es el material y cómo puede
//  estar codificado en SAP, y propone varias búsquedas abreviadas.
//  Ej: "arillo de seguridad inox 25" -> ["ari seg 25","aro seg 25","anillo seg 25"]
// ════════════════════════════════════════════════════════════════════════
const PROMPT_VARIANTES = `Eres un comprador industrial experto en SAP para Vidal Golosinas (industria alimentaria).
Gestionas materiales de: MANTENIMIENTO (repuestos para averías, piezas de desgaste, recambios), PRODUCCIÓN, OFICINA TÉCNICA, INVERSIONES y REPARACIONES de maquinaria industrial.

Las descripciones SAP están ABREVIADAS y el mismo material puede estar codificado con sinónimos distintos.

PASO 1 — INTERPRETA primero QUÉ pieza es realmente (NO te quedes con las palabras literales del usuario):
• "retén" = sello = sello de aceite = labio = seal → genera variantes con TODAS las formas
• "chumacera" = soporte rodamiento = UCP = UCF = UCFL → también busca como rodamiento
• "piñón" / "corona" = sprocket = rueda dentada = engranaje
• "rodamiento" = rodto = cojinete = bearing
• "correa" / "banda" (transmisión) = v-belt = vbelt = correa trapez = correa trapezoidal
• "electroválvula" = val solenoide = solenoide = valvula electrica
• "cilindro neumático" = actuador = cil neuma = pistón neumático
• "tornillo allen" = torn allen = hexágono interior = DIN 912 = allen M8
• "casquillo" = buje = manguito = casqui
• "prensaestopas" = prensaestopa = racor manguera = conector manguera
• "final de carrera" = sensor posicion = microinterruptor = limit switch
• Si el usuario usa un nombre coloquial del taller, identifica el nombre técnico comercial estándar
• Un repuesto puede nombrarse por la máquina donde va montado: busca también el nombre genérico del componente

═══════════════════════════════════════════════════════════
EQUIVALENCIAS TÉCNICAS CRÍTICAS — aplica SIEMPRE para estos materiales:

MOTORES ELÉCTRICOS:
• Potencia: CONVIERTE SIEMPRE a kW Y a CV (1 CV = 0,736 kW):
  0,09kW=0,12CV | 0,12kW=0,16CV | 0,18kW=0,25CV | 0,25kW=0,34CV
  0,37kW=0,5CV  | 0,55kW=0,75CV | 0,75kW=1CV    | 1,1kW=1,5CV
  1,5kW=2CV     | 2,2kW=3CV     | 3kW=4CV       | 4kW=5,5CV
  5,5kW=7,5CV   | 7,5kW=10CV    | 11kW=15CV     | 15kW=20CV
  18,5kW=25CV   | 22kW=30CV     | 30kW=40CV     | 37kW=50CV
• Velocidades/polos a 50 Hz:
  2 polos = 3000 rpm / 2900 rpm  |  4 polos = 1500 rpm / 1450 rpm
  6 polos = 1000 rpm / 960 rpm   |  8 polos = 750 rpm / 720 rpm
• "2V" o "2 velocidades" = biveloc = bivelo (motor de dos velocidades Dahlander)
• Carcasa IEC: 56/63/71/80/90L/100L/112M/132S/132M/160M/160L/180M/200L...
• Variantes SAP para motores: "mot" + potencia_kW + "kw" / "cv" + polos/rpm
  Ej. motor 1,5kW 4 polos → "mot 1.5kw 4p", "mot 2cv 1450rpm", "motor 1.5kw", "mot trifl 1.5", "mot 1.5 4 polos"

REDUCTORES:
• "reductor" = "reduc" = "motorreductor" = "motoreductor" = "reductor de velocidad"
• Relación i (índice de reducción): i=5/10/20/30/40/50/60/80/100
• Variantes: "reduc" + ratio + potencia_entrada (kW)

RODAMIENTOS:
• Referencia ISO: 6=rígido bolas | 7=contacto angular | 22=rótulas | 32=cónicos | NU/N=cilíndricos
• Sufijos: -2RS=2 retenes | -ZZ/-2Z=2 tapas metálicas | -C3=holgura C3
• "rodto" = "rodamiento" = "cojinete" = "bearing"
• Búsqueda por referencia: "rodto 6204", "rodto 6204-2rs", "cojinete 6204"

VARIADORES DE FRECUENCIA / ARRANCADORES:
• "variador" = "variador frec" = "inverter" = "convertidor frec" = "VFD" = "VSD"
• "arrancador suave" = "soft starter" = "arranc suave"
• Potencia en kW; busca con kW Y CV equivalente

BOMBAS:
• "bomba" = "bba" = "bomba centrifuga" = "bomba volutas"
• Caudal en m³/h o l/min; presión en bar o mca

CONTACTORES / PROTECCIONES:
• "contactor" = "cont" + amperios (A) o kW
• "relé térmico" = "rele termico" = "protecc motor" = "guardamotor"
═══════════════════════════════════════════════════════════

PASO 2 — Genera entre 5 y 8 BÚSQUEDAS abreviadas estilo SAP (como teclearía un comprador):
• Abreviaturas SAP habituales: val (válvula), torn (tornillo), rodto (rodamiento), mot (motor), reduc (reductor), abraz (abrazadera), jta (junta), cil (cilindro), ret (retén), bba (bomba), filt (filtro), cont (contactor), var (variador)
• Para motores: genera variantes con kW Y CV, con y sin polos/rpm
• Incluye la medida/referencia principal en cada variante relevante (diámetro, longitud, referencia)
• Cubre: término técnico estándar + coloquial de taller + abreviatura SAP + sinónimo de codificación
• Si la medida admite dos sistemas (DN50 = 2", NW40 = 1½"), genera variantes con ambos
• PROHIBIDO: inventar referencias, códigos SAP o marcas no mencionadas explícitamente

Devuelve SOLO un JSON sin texto adicional:
{"variantes": ["búsqueda1", "búsqueda2", "búsqueda3", "búsqueda4", "búsqueda5"]}`

async function generarVariantes(descripcion: string): Promise<string[]> {
  try {
    const resp = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: PROMPT_VARIANTES },
        { role: 'user', content: `Material: "${descripcion}"` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.3,
    })
    const content = resp.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content) as { variantes?: string[] }
    const variantes = Array.isArray(parsed.variantes) ? parsed.variantes.filter((v) => typeof v === 'string' && v.trim()) : []
    return variantes.slice(0, 7)
  } catch {
    return [] // si falla, el algoritmo usa solo la descripción normal
  }
}

const SYSTEM_PROMPT = `Eres el asistente de compras industriales de Vidal Golosinas. El motor de 5 pasos ya ejecutó el algoritmo y te entrega los candidatos con el proveedor correcto y los SAPs más relevantes del histórico real (enero 2025 – mayo 2026, 6.368 SAPs, 244 proveedores). Tu tarea: generar la respuesta final en el formato exacto, siendo técnico, preciso y sin inventar nada.

CÓMO FUNCIONA LA BÚSQUEDA (igual que un comprador experto en SAP):
1) Identifica QUÉ pieza es realmente (no te dejes engañar por las palabras literales del usuario).
2) Para MOTORES: interpreta siempre la potencia en kW Y CV (1 CV = 0,736 kW), número de polos/rpm (2p=3000rpm, 4p=1500rpm, 6p=1000rpm, 8p=750rpm). Si el usuario dice "motor 2CV 4 polos" pero la BD tiene "mot 1.5kw 4p", son el MISMO motor.
3) El motor ya ha buscado con varias abreviaturas/sinónimos y te da hasta 5 SAPs candidatos.
4) Tu trabajo es DEVOLVER ESOS CANDIDATOS para que el usuario elija uno. NO elijas tú uno solo: presenta todos los que el motor encontró (hasta 5), del más parecido al menos.

CAMPO tipo_match — indica cómo de bien se ha encontrado el material:
• "EXACTO": hay SAP con referencia/medida/potencia exacta o prácticamente idéntica
• "PARCIAL": hay SAP de la misma familia/tipo pero sin coincidencia exacta de medida o potencia (p.ej. motor de potencia cercana, rodamiento de serie similar)
• "EQUIVALENTE": el material solicitado no está en la BD con ese código/medida exactos, pero se propone un equivalente técnico válido por características (misma función, misma potencia equivalente kW/CV, mismos polos/rpm, compatible dimensionalmente)
• "SIN_MATCH": no hay datos suficientes para encontrar ni equivalente; se necesita más información

EQUIVALENCIAS DE PROVEEDOR (aplícalas en silencio, NO las expliques):
• 100025296 (BERDIN MURCIA) = 100035845 (BERDIN LEVANTE): usa 100035845.
• 100034920 = EFIX (en SAP puede figurar como "Inoxidables de Molina"; muestra siempre "EFIX"). NUNCA escribas "cód. heredado", "Inox.Molina" ni similar.
• INGEIN → vía BYSS (100025290). Equipos nuevos MARKEM → IPREMUR (100034742); repuestos MARKEM → Murcia Codificación (100033915).

LÓGICA INOX POR SUB-TIPO:
• Tubo / codo / machón / puntera / varilla / perfil / brida inox de soldar → EFIX (100034920); CIG (100025256) alternativa.
• Chapa inox estándar → EFIX o CIG. Chapa a medida / corte láser → MAQUISUR (100031455).
• Racores DIN 11851 / abrazaderas alimentarias → COREFLUID (100034026); EFIX alt.
• Mallas / rejillas inox → Mallas Inox Castellón (100034393).
• Válvulas bola inox → Pontones Guillamón (100033923). Válvulas HOFMA → Contagas (100034263).
• KARCHER (aunque ponga manguera) → CIG (100025256); Ferretería del Segura (100025134) alt.
• Herramienta manual (vaso, llave, carraca) → CIG; nunca tornillería.

REGLAS DURAS:
- NUNCA inventes proveedor ni SAP. Si el motor no da match → "pedir aclaración al responsable".
- SAP 599000000 → genérico, IGNÓRALO.
- DEVUELVE TODOS los SAPs candidatos del motor (hasta 5) en codigos_sap_sugeridos, ordenados del más parecido al menos. El usuario elegirá uno.
- Si un SAP viene marcado como aproximado (campo aproximado=true o con notaMedida), conserva esa nota en su campo "nota" para que el usuario sepa que debe verificar la medida.
- Para motores con tipo_match EQUIVALENTE: en el motivo explica la equivalencia (ej. "Motor solicitado 2 CV / 1,5 kW 4 polos — equivalente funcional al SAP 502XXXXXX que es 1,5 kW 4 polos / 1450 rpm").
- Proveedor: devuelve el principal y la alternativa. El usuario confirmará con cuál se gestiona.
- El motivo debe ser técnico y concreto: tipo real de pieza + medida/potencia + por qué ese proveedor.

OBSERVACIONES — LIMPIAS Y OPERATIVAS:
- Solo lo útil para gestionar el pedido. PROHIBIDO: "proveedor en declive", "cód. heredado", "Inox.Molina", explicaciones internas.
- Si no hay nada operativo, deja observaciones "".

SALIDA JSON ESTRICTO (sin texto antes ni después):
{
  "tipo_material": "string",
  "marca_detectada": "string (o 'no especificada')",
  "tipo_match": "EXACTO | PARCIAL | EQUIVALENTE | SIN_MATCH",
  "proveedor_recomendado": { "nombre": "string", "codigo": "string" },
  "alternativas": [ { "nombre": "string", "codigo": "string", "nota": "string opcional" } ],
  "codigos_sap_sugeridos": [ { "codigo": "string", "descripcion": "string", "proveedor": "string", "nota": "string opcional (medida no exacta, verificar...)" } ],
  "nivel_confianza": "ALTO | MEDIO | BAJO",
  "motivo": "string (breve y técnico)",
  "observaciones": "string (solo operativo; vacío si no hay nada útil)"
}`

interface SapSugeridoOut { codigo: string; descripcion: string; proveedor: string; nota?: string; aproximado?: boolean }

interface RecomendacionNueva {
  cantidad: number
  material_detectado: string
  descripcion: string
  categoria: string
  tipo_material: string
  marca_detectada: string
  proveedor_recomendado: { nombre: string; codigo: string }
  alternativas: Array<{ nombre: string; codigo: string; nota?: string }>
  codigos_sap_sugeridos: SapSugeridoOut[]
  nivel_confianza: 'ALTO' | 'MEDIO' | 'BAJO'
  tipoMatch?: 'EXACTO' | 'PARCIAL' | 'EQUIVALENTE' | 'SIN_MATCH'
  motivo: string
  observaciones: string
  seleccionado: boolean
  _pasoDeterminante: number
  leyendaMedidas?: string
}

function limpiarTextoInterno(s: string): string {
  if (!s) return s
  return s
    .replace(/\(?\s*c[oó]d\.?\s*(sap\s*)?heredado[^)]*\)?/gi, '')
    .replace(/\(?\s*inox\.?\s*molina[^)]*\)?/gi, '')
    .replace(/\(?\s*inoxidables?\s+de\s+molina[^)]*\)?/gi, '')
    .replace(/matinox[^.,;]*(en\s+declive)?/gi, '')
    .replace(/proveedor\s+en\s+declive/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .replace(/^[\s,;.]+/, '')
    .trim()
}

async function procesarMaterial(material: Material, index: number, total: number): Promise<RecomendacionNueva> {
  const db = loadDb()

  // 1) La IA genera variantes de búsqueda estilo SAP
  const variantes = await generarVariantes(material.descripcion)

  // 2) El motor busca usando esas variantes
  const resultado = ejecutarAlgoritmo(material.descripcion, db, variantes)

  const contextoAlgoritmo = {
    descripcion: material.descripcion,
    cantidad: material.cantidad,
    variantes_busqueda: variantes,
    paso_determinante: resultado.pasoDeterminante,
    tipo_material_detectado: resultado.tipoMaterial,
    categoria: resultado.categoria,
    marca_detectada: resultado.marcaDetectada,
    sap_en_solicitud: resultado.sapEnSolicitud || null,
    proveedor_principal_sugerido: resultado.principal,
    alternativas_sugeridas: resultado.alternativas,
    saps_relacionados: resultado.sapsSugeridos, // hasta 5, con flag aproximado y notaMedida
    candidato_centralizar: resultado.candidatoCentralizar,
    notas_sap: resultado.notasSap || null,
    notas_guia: resultado.notasGuia || null,
  }

  const userMsg = `Material ${index + 1}/${total}:
Descripción exacta del usuario: "${material.descripcion}"
Cantidad: ${material.cantidad}

Resultado del motor (5 pasos):
${JSON.stringify(contextoAlgoritmo, null, 2)}

INSTRUCCIONES:
1. Identifica el tipo REAL de pieza y la medida/potencia (si es motor, convierte kW↔CV y polos↔rpm).
2. Determina tipo_match: EXACTO si hay SAP que coincide en medida/potencia exacta; PARCIAL si es similar pero no exacto; EQUIVALENTE si los SAPs son de familia o potencia equivalente; SIN_MATCH si no hay datos suficientes.
3. DEVUELVE TODOS los saps_relacionados (hasta 5) en codigos_sap_sugeridos, del más parecido al menos. El usuario elegirá uno; no descartes candidatos tú.
4. Si un SAP trae notaMedida o aproximado=true, copia esa nota en su campo "nota".
5. Proveedor principal + alternativa; el usuario confirmará cuál.
6. Observaciones solo operativas. Genera el JSON final.`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 900,
    temperature: 0.05,
  })

  const content = response.choices[0]?.message?.content || '{}'
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = {}
  }

  const provBase = (parsed.proveedor_recomendado as { nombre: string; codigo: string }) || resultado.principal || { nombre: 'Sin datos', codigo: '' }
  const proveedorLimpio = {
    nombre: limpiarTextoInterno(String(provBase?.nombre ?? '')) || 'Sin datos',
    codigo: String(provBase?.codigo ?? ''),
  }

  const altsBase = (parsed.alternativas as Array<{ nombre: string; codigo: string; nota?: string }>) || resultado.alternativas || []
  const alternativasLimpias = altsBase.map((a) => ({
    nombre: limpiarTextoInterno(String(a.nombre ?? '')),
    codigo: String(a.codigo ?? ''),
    nota: a.nota ? limpiarTextoInterno(String(a.nota)) || undefined : undefined,
  }))

  // SAPs: preferimos los del motor (llevan flags), enriquecidos con la nota del modelo si la hay.
  const sapsMotor = resultado.sapsSugeridos || []
  const sapsModelo = (parsed.codigos_sap_sugeridos as SapSugeridoOut[]) || []
  const sapsLimpios: SapSugeridoOut[] = (sapsMotor.length ? sapsMotor : sapsModelo).map((s) => {
    const notaModelo = sapsModelo.find((m) => m.codigo === s.codigo)?.nota
    const nota = (s as { notaMedida?: string }).notaMedida || notaModelo
    return {
      codigo: String(s.codigo ?? ''),
      descripcion: String(s.descripcion ?? ''),
      proveedor: limpiarTextoInterno(String(s.proveedor ?? '')),
      aproximado: (s as { aproximado?: boolean }).aproximado === true,
      nota: nota ? limpiarTextoInterno(String(nota)) || undefined : undefined,
    }
  })

  const tipoMatchRaw = parsed.tipo_match as string | undefined
  const tipoMatchValido = ['EXACTO', 'PARCIAL', 'EQUIVALENTE', 'SIN_MATCH'].includes(tipoMatchRaw ?? '')
    ? (tipoMatchRaw as 'EXACTO' | 'PARCIAL' | 'EQUIVALENTE' | 'SIN_MATCH')
    : undefined

  return {
    cantidad: material.cantidad,
    material_detectado: `${material.cantidad}x ${material.descripcion}`,
    descripcion: material.descripcion,
    categoria: resultado.categoria || '',
    tipo_material: limpiarTextoInterno(String(parsed.tipo_material || resultado.tipoMaterial || 'No clasificado')),
    marca_detectada: String(parsed.marca_detectada || resultado.marcaDetectada || 'no especificada'),
    proveedor_recomendado: proveedorLimpio,
    alternativas: alternativasLimpias,
    codigos_sap_sugeridos: sapsLimpios,
    nivel_confianza: (parsed.nivel_confianza as 'ALTO' | 'MEDIO' | 'BAJO') || (resultado.pasoDeterminante <= 3 ? 'ALTO' : resultado.pasoDeterminante === 4 ? 'MEDIO' : 'BAJO'),
    tipoMatch: tipoMatchValido,
    motivo: limpiarTextoInterno(String(parsed.motivo || '')),
    observaciones: limpiarTextoInterno(String(parsed.observaciones || '')),
    seleccionado: true,
    _pasoDeterminante: resultado.pasoDeterminante,
    leyendaMedidas: resultado.leyendaMedidas || undefined,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { materiales }: { materiales: Material[] } = await req.json()

    if (!materiales?.length) {
      return NextResponse.json({ recomendaciones: [], pedidoUnificado: [] })
    }

    const recomendaciones = await Promise.all(
      materiales.map((m, i) => procesarMaterial(m, i, materiales.length))
    )

    // UNIFICACIÓN DE PEDIDO POR PROVEEDOR (mismo tipo de material → un solo proveedor)
    const items: ItemPedido[] = recomendaciones.map((r) => ({
      descripcion: r.descripcion,
      cantidad: r.cantidad,
      categoria: r.categoria,
      proveedorOriginal: r.proveedor_recomendado?.codigo
        ? { nombre: r.proveedor_recomendado.nombre, codigo: r.proveedor_recomendado.codigo }
        : null,
      proveedorAsignado: null,
      unificado: false,
      sapsSugeridos: r.codigos_sap_sugeridos,
    }))
    const itemsUnificados = unificarPedido(items)

    // Devolvemos las recomendaciones + el resultado de unificación por índice
    const pedidoUnificado = itemsUnificados.map((it, i) => ({
      indice: i,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      proveedor_asignado: it.proveedorAsignado,
      unificado: it.unificado,
      nota_unificacion: it.notaUnificacion || null,
    }))

    return NextResponse.json({ recomendaciones, pedidoUnificado })
  } catch (error) {
    console.error('Recommend error:', error)
    return NextResponse.json({ error: 'Error en recomendación' }, { status: 500 })
  }
}
