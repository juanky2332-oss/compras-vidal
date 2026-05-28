import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { loadDb } from '@/lib/dbLoader'
import { ejecutarAlgoritmo } from '@/lib/algoritmo'
import type { Material } from '@/lib/types'

export const dynamic = 'force-dynamic'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const SYSTEM_PROMPT = `Eres el asistente de compras industriales de Vidal Golosinas. El motor de 5 pasos ya ejecutó el algoritmo y te entrega los candidatos con el proveedor correcto y los SAPs más relevantes del histórico real (enero 2025 – mayo 2026, 6.368 SAPs, 244 proveedores). Tu tarea: generar la respuesta final en el formato exacto, siendo técnico, preciso y sin inventar nada.

ANTES DE RESPONDER, RAZONA EN ESTE ORDEN (no lo escribas, solo úsalo):
1) ¿QUÉ pieza es realmente? Identifica el TIPO de pieza (herramienta, tubo, puntera, varilla, chapa, válvula, racor...). No te dejes engañar por palabras sueltas: "vaso hexagonal" es una HERRAMIENTA (llave de vaso), NO tornillería; "hexagonal" aquí describe la herramienta, no un tornillo.
2) ¿QUÉ MEDIDA pide? Detecta pulgadas, mm, Ø, SCH, DN. La medida es OBLIGATORIA para elegir el SAP.
3) Elige SOLO SAPs cuyo tipo de pieza Y medida coincidan con lo pedido. El motor ya filtra medidas incompatibles; tú NO debes reintroducir un SAP de otra medida o de otro tipo de pieza.

EQUIVALENCIAS DE PROVEEDOR (aplícalas en silencio, NO las expliques al usuario):
• 100025296 (BERDIN MURCIA) = 100035845 (BERDIN LEVANTE): usa 100035845.
• 100034920 = EFIX. En SAP puede figurar como "Inoxidables de Molina", pero el proveedor es EFIX. Muestra siempre "EFIX". NUNCA escribas "cód. heredado", "Inox.Molina" ni aclaraciones de este tipo en la respuesta.
• INGEIN → canalizar vía BYSS (100025290).
• Equipos nuevos MARKEM → IPREMUR (100034742). Repuestos MARKEM → Murcia Codificación (100033915).

LÓGICA INOX POR SUB-TIPO (para validar el proveedor correcto):
• Tubo / codo / machón / puntera / varilla / perfil / brida inox de soldar (A-304, A-316, SCH-10) → EFIX (100034920); CIG (100025256) alternativa.
• Chapa inox estándar/comercial → EFIX o CIG. Chapa inox a medida / corte láser / pliego especial → MAQUISUR (100031455).
• Racores DIN 11851 / abrazaderas alimentarias inox → COREFLUID (100034026); EFIX alternativa.
• Mallas inox → Mallas Inox Castellón (100034393).
• Calderería inox / depósitos → CEDINOX (100034810).
• Válvulas bola inox → Pontones Guillamón (100033923).
• Válvulas HOFMA asiento inclinado → Contagas (100034263).

OTRAS REGLAS DE NEGOCIO:
• KARCHER: aunque ponga "manguera", el material marca KARCHER lo sirve CIG (100025256); Ferretería del Segura (100025134) alternativa.
• Herramienta manual (vaso, llave, carraca, destornillador): CIG principal; Maq. y Herram. del Sureste / Ferretería del Segura alternativas. NUNCA clasificar como tornillería.

REGLAS DURAS:
- NUNCA inventes proveedor ni SAP. Si el motor no da match → indica "pedir aclaración al responsable".
- SAP 599000000 → genérico, IGNÓRALO siempre.
- Usa los saps_relacionados del motor. Elige 2-4, pero SOLO los que coincidan en tipo de pieza y medida con la solicitud. Si solo hay 1 que encaje, devuelve 1. Es preferible 1 SAP correcto que 3 con medidas distintas.
- Si candidato_centralizar=true → añade en observaciones: "Candidato a centralizar".
- En avería urgente → prioriza rapidez sobre precio e indícalo.
- El motivo debe ser técnico y concreto: tipo real de pieza + medida + por qué ese proveedor.

OBSERVACIONES — LIMPIAS Y OPERATIVAS:
- Escribe SOLO lo útil para gestionar el pedido (medida a confirmar, alternativa de proveedor, urgencia, candidato a centralizar).
- PROHIBIDO escribir: "proveedor en declive", "MATINOX en declive", "cód. heredado", "Inox.Molina", referencias a equivalencias internas, o cualquier explicación del funcionamiento interno.
- Si no hay nada operativo que añadir, deja observaciones en cadena vacía "".

SALIDA JSON ESTRICTO (sin texto antes ni después):
{
  "tipo_material": "string",
  "marca_detectada": "string (o 'no especificada')",
  "proveedor_recomendado": { "nombre": "string", "codigo": "string" },
  "alternativas": [ { "nombre": "string", "codigo": "string", "nota": "string opcional" } ],
  "codigos_sap_sugeridos": [ { "codigo": "string", "descripcion": "string", "proveedor": "string" } ],
  "nivel_confianza": "ALTO | MEDIO | BAJO",
  "motivo": "string (breve y técnico: tipo real de pieza + medida + razón del proveedor)",
  "observaciones": "string (solo operativo; vacío si no hay nada útil)"
}`

interface RecomendacionNueva {
  cantidad: number
  material_detectado: string
  tipo_material: string
  marca_detectada: string
  proveedor_recomendado: { nombre: string; codigo: string }
  alternativas: Array<{ nombre: string; codigo: string; nota?: string }>
  codigos_sap_sugeridos: Array<{ codigo: string; descripcion: string; proveedor: string }>
  nivel_confianza: 'ALTO' | 'MEDIO' | 'BAJO'
  motivo: string
  observaciones: string
  seleccionado: boolean
  _pasoDeterminante: number
}

// Limpia cualquier comentario interno que se cuele en proveedores/SAPs/observaciones.
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
  const resultado = ejecutarAlgoritmo(material.descripcion, db)

  const contextoAlgoritmo = {
    descripcion: material.descripcion,
    cantidad: material.cantidad,
    paso_determinante: resultado.pasoDeterminante,
    tipo_material_detectado: resultado.tipoMaterial,
    categoria: resultado.categoria,
    marca_detectada: resultado.marcaDetectada,
    sap_en_solicitud: resultado.sapEnSolicitud || null,
    proveedor_principal_sugerido: resultado.principal,
    alternativas_sugeridas: resultado.alternativas,
    saps_relacionados: resultado.sapsSugeridos,
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
1. PRIMERO identifica el tipo REAL de pieza y la MEDIDA solicitada. No confundas herramientas con tornillería ni mezcles tipos de pieza.
2. El proveedor_recomendado y alternativas ya están calculados por el motor — úsalos salvo que una regla de negocio del prompt de sistema exija corrección.
3. Los saps_relacionados ya vienen filtrados por tipo de pieza y medida. Elige 2-4, descartando cualquiera cuya medida o tipo de pieza no coincida exactamente con la solicitud. Si solo uno encaja, devuelve uno.
4. Observaciones: solo información operativa. PROHIBIDO mencionar proveedores en declive, códigos heredados o nombres internos del SAP.
5. Genera la respuesta JSON final siguiendo el formato obligatorio.`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 800,
    temperature: 0.05,
  })

  const content = response.choices[0]?.message?.content || '{}'
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = {}
  }

  // Saneado final: aplica equivalencia EFIX/Inox.Molina visible y limpia textos internos.
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

  const sapsBase = (parsed.codigos_sap_sugeridos as Array<{ codigo: string; descripcion: string; proveedor: string }>) || resultado.sapsSugeridos || []
  const sapsLimpios = sapsBase.map((s) => ({
    codigo: String(s.codigo ?? ''),
    descripcion: String(s.descripcion ?? ''),
    proveedor: limpiarTextoInterno(String(s.proveedor ?? '')),
  }))

  return {
    cantidad: material.cantidad,
    material_detectado: `${material.cantidad}x ${material.descripcion}`,
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
  }
}

export async function POST(req: NextRequest) {
  try {
    const { materiales }: { materiales: Material[] } = await req.json()

    if (!materiales?.length) {
      return NextResponse.json({ recomendaciones: [] })
    }

    const recomendaciones = await Promise.all(
      materiales.map((m, i) => procesarMaterial(m, i, materiales.length))
    )

    return NextResponse.json({ recomendaciones })
  } catch (error) {
    console.error('Recommend error:', error)
    return NextResponse.json({ error: 'Error en recomendación' }, { status: 500 })
  }
}
