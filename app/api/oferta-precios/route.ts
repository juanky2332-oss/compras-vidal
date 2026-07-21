import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { calcularFormatoSAP, importeNetoConDescuento } from '@/lib/sapPrecio'
import type { LineaOfertaPrecio } from '@/lib/types'

export const dynamic = 'force-dynamic'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const MODELO_RAPIDO = process.env.OPENAI_MODEL_RAPIDO || 'gpt-4o-mini'

// Este prompt SOLO extrae los datos crudos de la oferta (descripción, cantidad,
// importe o precio+descuento). El cálculo del precio unitario y el formato SAP
// lo hace el código (lib/sapPrecio.ts) para garantizar redondeo y verificación
// exactos — nunca se le pide a la IA que calcule ni redondee importes.
const SYSTEM_PROMPT = `Eres un extractor de líneas de una oferta o presupuesto de un proveedor industrial, para el departamento de compras de Vidal Golosinas.

Recibes el texto de una oferta (email, PDF copiado, WhatsApp, tabla de precios) y debes extraer cada concepto/artículo TAL CUAL aparece, SIN calcular ni redondear nada tú mismo (el cálculo del precio unitario lo hace el sistema después).

Para cada línea identifica:
- "descripcion": texto del artículo/concepto (limpio, sin el importe).
- "cantidad": número de unidades (si no aparece, usa 1).
- Y exactamente UNO de estos dos modos de precio, según lo que diga la oferta:
  a) modo "total": la oferta da un IMPORTE TOTAL de esa línea (con o sin descuento ya aplicado) -> devuelve "importeTotal": number.
  b) modo "unitario_bruto": la oferta da un PRECIO POR UNIDAD de tarifa y un % DE DESCUENTO aparte -> devuelve "precioUnitarioBruto": number y "descuentoPct": number (0 si no hay descuento explícito para esa línea).

Si detectas el nombre de una empresa/proveedor en el texto (ej. "BERDIN", "empresa BERDIN", cabecera de la oferta), devuélvelo en "proveedor" (o null si no aparece).

Usa SIEMPRE punto decimal en los números del JSON de salida (nunca coma), aunque en el texto original vengan con coma decimal.

NO inventes conceptos ni importes. Si una línea no tiene cantidad ni importe identificable, ignórala. No hay límite de descuento: puede haber líneas con descuento y otras sin él en la misma oferta.

SALIDA JSON ESTRICTO (sin texto antes ni después):
{
  "proveedor": "string o null",
  "lineas": [
    { "descripcion": "string", "cantidad": number, "modo": "total", "importeTotal": number }
  ]
}
(cada línea es "modo":"total" con "importeTotal", o "modo":"unitario_bruto" con "precioUnitarioBruto" y "descuentoPct")`

interface LineaBruta {
  descripcion?: string
  cantidad?: number
  modo?: 'total' | 'unitario_bruto'
  importeTotal?: number
  precioUnitarioBruto?: number
  descuentoPct?: number
}

export async function POST(req: NextRequest) {
  try {
    const { texto, proveedor: proveedorSugerido }: { texto?: string; proveedor?: string } = await req.json()

    if (!texto?.trim()) {
      return NextResponse.json({ proveedor: null, lineas: [] })
    }

    const response = await getOpenAI().chat.completions.create({
      model: MODELO_RAPIDO,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Texto de la oferta:\n"""\n${texto}\n"""\n\nExtrae las líneas según las reglas. Devuelve el JSON.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      temperature: 0,
    })

    const content = response.choices[0]?.message?.content || '{"lineas":[]}'
    let parsed: { proveedor?: string | null; lineas?: LineaBruta[] }
    try {
      parsed = JSON.parse(content)
    } catch {
      parsed = { lineas: [] }
    }

    const proveedor = (parsed.proveedor || proveedorSugerido || '').toString().trim() || null

    const lineas: LineaOfertaPrecio[] = (parsed.lineas || [])
      .map((l): LineaOfertaPrecio | null => {
        const descripcion = String(l.descripcion || '').trim()
        const cantidad = Number(l.cantidad) > 0 ? Number(l.cantidad) : 1
        if (!descripcion) return null

        let importeTotal: number
        let descuentoPct = 0

        if (l.modo === 'unitario_bruto' && Number.isFinite(Number(l.precioUnitarioBruto))) {
          descuentoPct = Number(l.descuentoPct) > 0 ? Number(l.descuentoPct) : 0
          importeTotal = importeNetoConDescuento(Number(l.precioUnitarioBruto), cantidad, descuentoPct)
        } else if (Number.isFinite(Number(l.importeTotal))) {
          importeTotal = Number(l.importeTotal)
        } else {
          return null
        }

        const formato = calcularFormatoSAP(importeTotal, cantidad)

        return {
          descripcion,
          cantidad,
          descuentoPct,
          importeTotal,
          precioUnitario: formato.precioUnitario,
          precioUnitarioLabel: formato.precioUnitarioLabel,
          precioSAP: formato.precioSAP,
          multiplicador: formato.multiplicador,
          multiplicadorLabel: formato.multiplicadorLabel,
        }
      })
      .filter((l): l is LineaOfertaPrecio => l !== null)

    return NextResponse.json({ proveedor, lineas })
  } catch (error) {
    console.error('Oferta-precios error:', error)
    return NextResponse.json({ error: 'Error al procesar la oferta' }, { status: 500 })
  }
}
