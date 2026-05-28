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

EQUIVALENCIAS CRÍTICAS (SIEMPRE activas, no negociables):
• 100025296 (BERDIN MURCIA) ≡ 100035845 (BERDIN LEVANTE) → misma empresa, usar 100035845 para nuevos pedidos
• 100034920 = EFIX (en SAP figura como "Inoxidables de Molina" pero el proveedor real es EFIX). TODA compra a 100034920 es EFIX.
• 100025303 MATINOX → EN DECLIVE; para inox nuevos pedidos → EFIX (100034920). Matinox solo si material específico suyo.
• INGEIN → no proveedor directo SAP; canalizar siempre vía BYSS (100025290)
• 100034742 IPREMUR → preferente para EQUIPOS NUEVOS MARKEM. Para REPUESTOS MARKEM → Murcia Codificación (100033915).

LÓGICA INOX — RAZONA POR SUB-TIPO (crítico para dar el proveedor correcto):
• Tubo/accesorio/codo/machón/puntera/brida inox soldar (A-304, A-316, SCH-10) → EFIX (100034920)
• Racores DIN 11851 / abrazaderas alimentarias inox → COREFLUID (100034026) principal; EFIX alt.
• Chapa inox a medida / corte láser → MAQUISUR (100031455); Troquelajes Yagüés alt.
• Mallas inox → Mallas Inox Castellón (100034393)
• Calderería inox / depósitos → CEDINOX (100034810)
• Ángulos / perfiles inox generales → CIG (100025256) o EFIX
• Válvulas bola inox → Pontones Guillamón (100033923)
• Válvulas HOFMA asiento inclinado → Contagas (100034263)

REGLAS DURAS:
- NUNCA inventar proveedor ni SAP. Si el motor no da match → "pedir aclaración al responsable"
- SAP 599000000 → código genérico, IGNORAR siempre
- Si candidatoCentralizar=true → mencionar en observaciones: "⚠ Candidato a centralizar"
- En avería urgente → priorizar rapidez sobre precio, indicarlo en observaciones
- Jerarquía: 1) habitual, 2) disponibilidad, 3) técnica, 4) historial, 5) gestión, 6) centralización, 7) precio
- Los códigos SAP sugeridos deben ser los más cercanos al material solicitado según las saps_relacionados del motor
- El motivo debe ser técnico y concreto: indica el sub-tipo de material, por qué ese proveedor y la lógica aplicada
- Las observaciones deben incluir: equivalencias aplicadas, aviso de proveedor en declive si aplica, candidato centralizar, consejos para el pedido

SALIDA JSON ESTRICTO (sin texto antes ni después):
{
  "tipo_material": "string",
  "marca_detectada": "string (o 'no especificada')",
  "proveedor_recomendado": {
    "nombre": "string",
    "codigo": "string"
  },
  "alternativas": [
    { "nombre": "string", "codigo": "string", "nota": "string opcional" }
  ],
  "codigos_sap_sugeridos": [
    { "codigo": "string", "descripcion": "string", "proveedor": "string" }
  ],
  "nivel_confianza": "ALTO | MEDIO | BAJO",
  "motivo": "string (breve y técnico: sub-tipo material + razón del proveedor)",
  "observaciones": "string (equivalencias, proveedor en declive, candidato centralizar, tips pedido)"
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
1. El proveedor_recomendado y alternativas ya están calculados por el motor — úsalos salvo que las equivalencias críticas exijan corrección.
2. Los saps_relacionados son los SAPs más cercanos al material solicitado según scoring multi-token del histórico real. Elige los 2-4 más relevantes para codigos_sap_sugeridos, priorizando los que más se parecen a la descripción.
3. Si hay notas_guia o notas_sap del motor, inclúyelas en observaciones.
4. Para inox: aplica la lógica de sub-tipo del prompt de sistema para validar el proveedor y generar un motivo preciso.
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

  return {
    cantidad: material.cantidad,
    material_detectado: `${material.cantidad}x ${material.descripcion}`,
    tipo_material: String(parsed.tipo_material || resultado.tipoMaterial || 'No clasificado'),
    marca_detectada: String(parsed.marca_detectada || resultado.marcaDetectada || 'no especificada'),
    proveedor_recomendado: (parsed.proveedor_recomendado as { nombre: string; codigo: string }) || resultado.principal || { nombre: 'Sin datos', codigo: '' },
    alternativas: (parsed.alternativas as Array<{ nombre: string; codigo: string; nota?: string }>) || resultado.alternativas || [],
    codigos_sap_sugeridos: (parsed.codigos_sap_sugeridos as Array<{ codigo: string; descripcion: string; proveedor: string }>) || resultado.sapsSugeridos || [],
    nivel_confianza: (parsed.nivel_confianza as 'ALTO' | 'MEDIO' | 'BAJO') || (resultado.pasoDeterminante <= 2 ? 'ALTO' : resultado.pasoDeterminante === 3 ? 'ALTO' : resultado.pasoDeterminante === 4 ? 'MEDIO' : 'BAJO'),
    motivo: String(parsed.motivo || ''),
    observaciones: String(parsed.observaciones || ''),
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
