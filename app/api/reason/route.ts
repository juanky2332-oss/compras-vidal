import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { FuzzyResult, Recomendacion } from '@/lib/types'

export const dynamic = 'force-dynamic'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const SYSTEM_PROMPT = `Eres el asistente de compras de Vidal Golosinas. Analizas histórico real y das recomendaciones útiles, sin inventar nada, para que el comprador pueda crear el pedido en SAP con confianza.

ENTRADA:
Cada material llega con: descripción, cantidad y candidatos del histórico (proveedor, código SAP, flag sapEsGenerico, material exacto, puntuación), más pistas: hayMatchExacto, todosLosMatchesExactosSonGenericos, hayMatchExactoConSapReal, sapsRealesFamilia.

ENTENDER EL SAP — REGLA CRÍTICA:
Un código SAP "599000000" (o 0000000000599000000) es un código COMODÍN/RELLENO que se usa al crear una solicitud cuando todavía no hay SAP oficial. No sirve para pedidos reales. Cada match trae un flag "sapEsGenerico": true/false. NUNCA muestres un SAP genérico como recomendación.

LÓGICA DE 3 SITUACIONES — ELIGE UNA POR MATERIAL:

A) SAP CONFIRMADO (confianza ALTO):
   Si hayMatchExactoConSapReal = true → el material consultado coincide casi exactamente con un match cuyo SAP NO es genérico.
   - codigo_sap = ese SAP real.
   - sap_status = "confirmado".
   - motivo: explica brevemente el match (ej: "Match exacto en histórico").
   - alternativas: opcional (0-1), otros proveedores que también lo han suministrado con SAP real si existen.

B) MATERIAL COMPRADO PERO SIN SAP OFICIAL (confianza MEDIO):
   Si hayMatchExacto = true PERO todosLosMatchesExactosSonGenericos = true → el material aparece en el histórico, pero todas las compras se hicieron con SAP comodín.
   - codigo_sap = "" (vacío, NO inventes).
   - sap_status = "sin_codificar".
   - proveedor = el que más veces lo ha suministrado.
   - motivo: "Comprado anteriormente a {proveedor} pero registrado con SAP genérico, pendiente de codificación oficial".
   - alternativas: incluye 1-3 SAPs reales de la misma familia (de sapsRealesFamilia) como CANDIDATOS A VERIFICAR.
   - observaciones: indicar al comprador que solicite codificación oficial o que verifique con el proveedor.

C) SIN MATCH EXACTO (confianza BAJO):
   No hay match exacto (hayMatchExacto = false), solo productos parecidos.
   - codigo_sap = SAP del producto más parecido (si tiene SAP real), o "" si todos son genéricos.
   - sap_status = "aproximado" (si das un SAP) o "ninguno" (si no hay).
   - alternativas: hasta 3 SAPs/proveedores plausibles, cada uno con su nota diferenciadora.
   - observaciones: pedir referencia exacta del fabricante o foto para precisar.

CRITERIOS GENERALES:
- "material_detectado" empieza con la cantidad: "8x descripcion".
- proveedor_recomendado nunca vacío si hay matches: pon el de mayor recurrencia.
- Si NO hay nada en histórico: proveedor "Sin datos", codigo_sap "", sap_status "ninguno", confianza BAJO, alternativas [].
- Las alternativas SIEMPRE deben aportar info útil. Si una alternativa repite exactamente la principal, omítela.
- Sé técnico, breve, accionable.
- IDIOMA: español técnico, sin rodeos.

CONOCIMIENTO ÚTIL SOBRE PROVEEDORES VIDAL (solo para validar coherencia, NO inventar):
- Eléctricos / automatización: Electromain, Berdín Levante, CEF.
- Hidráulica / inox / fontanería industrial: Hidráulica del Segura, Pontones Guillamón, Comercial Industrial García, Alfa Cediva.
- Mecánica / herramienta: Maq. y Herram. del Sureste, Ferretería del Segura.

SALIDA JSON ESTRICTO (array, uno por material):
[
  {
    "cantidad": number,
    "material_detectado": "Nx descripción",
    "recomendacion_principal": {
      "proveedor": string,
      "codigo_sap": string,
      "sap_status": "confirmado" | "sin_codificar" | "aproximado" | "ninguno",
      "material_historico": string,
      "motivo": string
    },
    "alternativas": [
      {
        "proveedor": string,
        "codigo_sap": string,
        "material_historico": string,
        "nota": string
      }
    ],
    "nivel_confianza": "ALTO" | "MEDIO" | "BAJO",
    "observaciones": string
  }
]`

async function razonarMaterial(item: FuzzyResult): Promise<Recomendacion> {
  const userContent = `Material consultado (${item.indice}/${item.total}):
Descripcion: "${item.consultaRaw}"
Cantidad: ${item.cantidad}

PISTAS DEL MOTOR:
- hayMatchExacto: ${item.matches.hayMatchExacto}
- hayMatchExactoConSapReal: ${item.matches.hayMatchExactoConSapReal}
- todosLosMatchesExactosSonGenericos: ${item.matches.todosLosMatchesExactosSonGenericos}

Top proveedores del historico:
${JSON.stringify(item.matches.proveedoresHistoricoTop, null, 2)}

Coincidencias en historico (con flag sapEsGenerico):
${JSON.stringify(item.matches.historicoCompras, null, 2)}

SAPs REALES de la familia disponibles para sugerir como candidatos a verificar:
${JSON.stringify(item.matches.sapsRealesFamilia, null, 2)}

Aplica la logica de 3 situaciones (A/B/C) y devuelve el JSON estricto.`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
    temperature: 0.1,
  })

  const content = response.choices[0]?.message?.content || '[]'
  let parsed = JSON.parse(content)

  if (Array.isArray(parsed)) parsed = parsed[0] || {}
  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' && 'materiales' in parsed) {
    const arr = (parsed as { materiales: Recomendacion[] }).materiales
    parsed = Array.isArray(arr) ? arr[0] || {} : {}
  }

  return {
    cantidad: parsed.cantidad || item.cantidad,
    material_detectado: parsed.material_detectado || `${item.cantidad}x ${item.consultaRaw}`,
    recomendacion_principal: parsed.recomendacion_principal || {
      proveedor: 'Sin datos',
      codigo_sap: '',
      sap_status: 'ninguno',
      material_historico: '',
      motivo: '',
    },
    alternativas: parsed.alternativas || [],
    nivel_confianza: parsed.nivel_confianza || 'BAJO',
    observaciones: parsed.observaciones || '',
    seleccionado: true,
    _fuzzyData: item,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fuzzyResults }: { fuzzyResults: FuzzyResult[] } = await req.json()

    if (!fuzzyResults?.length) {
      return NextResponse.json({ recomendaciones: [] })
    }

    const recomendaciones = await Promise.all(fuzzyResults.map((item) => razonarMaterial(item)))

    return NextResponse.json({ recomendaciones })
  } catch (error) {
    console.error('Reason error:', error)
    return NextResponse.json({ error: 'Reasoning failed' }, { status: 500 })
  }
}
