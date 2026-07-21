import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { loadDb } from '@/lib/dbLoader'
import { norm, buscarSAPsConFallback } from '@/lib/algoritmo'
import { calcularFormatoSAP, importeNetoConDescuento } from '@/lib/sapPrecio'
import type { LineaOfertaSAP } from '@/lib/types'

export const dynamic = 'force-dynamic'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const MODELO_RAPIDO = process.env.OPENAI_MODEL_RAPIDO || 'gpt-4o-mini'

// Extrae SOLO los datos crudos de la oferta/pedido (descripción, cantidad y,
// si aparece, importe o precio+descuento). El precio es OPCIONAL: puede venir
// una lista de conceptos sin ningún importe. El cálculo del precio unitario y
// el formato SAP lo hace el código (lib/sapPrecio.ts), nunca la IA.
const SYSTEM_PROMPT = `Eres un extractor de líneas de un pedido, OCC, solicitud de compra u oferta de proveedor industrial, para el departamento de compras de Vidal Golosinas.

Recibes texto libre (lista de conceptos, oferta con precios, email, WhatsApp) y debes extraer cada concepto/artículo TAL CUAL aparece, SIN calcular ni redondear nada tú mismo.

Para cada línea identifica:
- "descripcion": texto del artículo/concepto (limpio, sin el importe ni la cantidad).
- "cantidad": número de unidades (si no aparece, usa 1).
- Y el precio, SOLO SI aparece en el texto, en uno de estos modos:
  a) "sin_precio": la línea no trae ningún importe (es solo una lista de materiales a pedir). Es el caso más habitual si el usuario solo pega conceptos.
  b) "total": la oferta da un IMPORTE TOTAL de esa línea (con o sin descuento ya aplicado) -> añade "importeTotal": number.
  c) "unitario_bruto": la oferta da un PRECIO POR UNIDAD de tarifa y un % DE DESCUENTO aparte -> añade "precioUnitarioBruto": number y "descuentoPct": number (0 si no hay descuento explícito).

Si detectas el nombre de una empresa/proveedor en el texto (ej. "empresa BERDIN", cabecera de la oferta, "BERDIN:"), devuélvelo en "proveedor" (o null si no aparece). Esto es importante: TODAS las líneas de una misma oferta van SIEMPRE al mismo proveedor único, así que solo necesitas detectar UN nombre de proveedor para todo el texto.

Usa SIEMPRE punto decimal en los números del JSON de salida (nunca coma), aunque el texto original use coma decimal.

NO inventes conceptos, cantidades ni importes. Ignora números de OCC/aviso/solicitud, códigos SAP genéricos 599000000, firmas, fechas y saludos.

SALIDA JSON ESTRICTO (sin texto antes ni después):
{
  "proveedor": "string o null",
  "lineas": [
    { "descripcion": "string", "cantidad": number, "modo": "sin_precio" }
  ]
}
(cada línea es "modo":"sin_precio", o "modo":"total" con "importeTotal", o "modo":"unitario_bruto" con "precioUnitarioBruto" y "descuentoPct")`

interface LineaBruta {
  descripcion?: string
  cantidad?: number
  modo?: 'sin_precio' | 'total' | 'unitario_bruto'
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
        { role: 'user', content: `Texto:\n"""\n${texto}\n"""\n\nExtrae las líneas según las reglas. Devuelve el JSON.` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1800,
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
    const db = loadDb()

    const lineas: LineaOfertaSAP[] = (parsed.lineas || [])
      .map((l): LineaOfertaSAP | null => {
        const descripcion = String(l.descripcion || '').trim()
        const cantidad = Number(l.cantidad) > 0 ? Number(l.cantidad) : 1
        if (!descripcion) return null

        let tienePrecio = false
        let descuentoPct = 0
        let importeTotal = 0

        if (l.modo === 'unitario_bruto' && Number.isFinite(Number(l.precioUnitarioBruto))) {
          tienePrecio = true
          descuentoPct = Number(l.descuentoPct) > 0 ? Number(l.descuentoPct) : 0
          importeTotal = importeNetoConDescuento(Number(l.precioUnitarioBruto), cantidad, descuentoPct)
        } else if (l.modo === 'total' && Number.isFinite(Number(l.importeTotal))) {
          tienePrecio = true
          importeTotal = Number(l.importeTotal)
        }

        const formato = tienePrecio
          ? calcularFormatoSAP(importeTotal, cantidad)
          : { precioUnitario: 0, precioUnitarioLabel: '', precioSAP: '', multiplicador: 1, multiplicadorLabel: '' }

        // Búsqueda del código SAP más parecido (o exacto) en el histórico/catálogo.
        // No se pasa proveedor: en esta pestaña el proveedor es único y lo fija el
        // usuario, no lo decide el motor.
        const descNorm = norm(descripcion)
        const candidatos = buscarSAPsConFallback(descNorm, db, undefined, [], 3)
        const mejor = candidatos[0] || null

        // El motor de búsqueda solo compara medidas físicas (pulgadas/mm/DN/SCH);
        // no valida referencias/números de modelo sueltos (ej. rodamiento 6204 vs
        // 6305). Si la descripción pedida trae un número de 3+ cifras que no
        // aparece en la descripción del SAP encontrado, es una referencia distinta:
        // se baja a aproximado aunque el motor lo diera por exacto.
        let exacto = mejor ? !mejor.aproximado : false
        if (mejor && exacto) {
          const numerosPedido = descNorm.match(/\d{3,}/g) || []
          const descCandidatoNorm = norm(mejor.descripcion)
          if (numerosPedido.length > 0 && !numerosPedido.some((n) => descCandidatoNorm.includes(n))) {
            exacto = false
          }
        }

        return {
          descripcion,
          cantidad,
          sapCodigo: mejor?.codigo || '',
          sapDescripcion: mejor?.descripcion || '',
          exacto,
          tienePrecio,
          descuentoPct,
          importeTotal,
          precioUnitario: formato.precioUnitario,
          precioUnitarioLabel: formato.precioUnitarioLabel,
          precioSAP: formato.precioSAP,
          multiplicador: formato.multiplicador,
          multiplicadorLabel: formato.multiplicadorLabel,
        }
      })
      .filter((l): l is LineaOfertaSAP => l !== null)

    return NextResponse.json({ proveedor, lineas })
  } catch (error) {
    console.error('Ofertas-sap error:', error)
    return NextResponse.json({ error: 'Error al procesar el texto' }, { status: 500 })
  }
}
