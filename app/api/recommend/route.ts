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

PASO 2 — Genera entre 4 y 7 BÚSQUEDAS abreviadas estilo SAP (como teclearía un comprador):
• Abreviaturas SAP habituales: val (válvula), torn (tornillo), rodto (rodamiento), mot (motor), reduc (reductor), abraz (abrazadera), jta (junta), cil (cilindro), ret (retén), bba (bomba), filt (filtro), cont (contactor)
• Incluye la medida/referencia principal en cada variante relevante (diámetro, longitud, referencia)
• Cubre: término técnico estándar + coloquial de taller + abreviatura SAP + sinónimo de codificación
• Si la medida admite dos sistemas (DN50 = 2", NW40 = 1½"), genera variantes con ambos
• PROHIBIDO: inventar referencias, códigos SAP o marcas no mencionadas explícitamente

Devuelve SOLO un JSON sin texto adicional:
{"variantes": ["búsqueda1", "búsqueda2", "búsqueda3", "búsqueda4"]}`

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

CÓMO FUNCIONA LA BÚSQUEDA (igual que un comprador en SAP):
1) Identifica QUÉ pieza es realmente (no te dejes engañar por palabras sueltas).
2) El motor ya ha buscado el material con varias abreviaturas/sinónimos (ari seg, aro seg, anillo seg...) y te da hasta 5 SAPs candidatos parecidos.
3) Tu trabajo es DEVOLVER ESOS CANDIDATOS para que el usuario elija uno. NO elijas tú uno solo: presenta los que el motor encontró (hasta 5), del más parecido al menos.

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
- Proveedor: devuelve el principal y la alternativa. El usuario confirmará con cuál se gestiona.
- El motivo debe ser técnico y concreto: tipo real de pieza + medida + por qué ese proveedor.

OBSERVACIONES — LIMPIAS Y OPERATIVAS:
- Solo lo útil para gestionar el pedido. PROHIBIDO: "proveedor en declive", "cód. heredado", "Inox.Molina", explicaciones internas.
- Si no hay nada operativo, deja observaciones "".

SALIDA JSON ESTRICTO (sin texto antes ni después):
{
  "tipo_material": "string",
  "marca_detectada": "string (o 'no especificada')",
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
1. Identifica el tipo REAL de pieza y la medida.
2. DEVUELVE TODOS los saps_relacionados (hasta 5) en codigos_sap_sugeridos, del más parecido al menos. El usuario elegirá uno; no descartes candidatos tú.
3. Si un SAP trae notaMedida o aproximado=true, copia esa nota en su campo "nota".
4. Proveedor principal + alternativa; el usuario confirmará cuál.
5. Observaciones solo operativas. Genera el JSON final.`

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
