import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const OCR_PROMPT = `Eres un OCR de fotos/capturas relacionadas con compras industriales en Vidal Golosinas. Tu objetivo es extraer SOLO los datos útiles para identificar materiales a comprar.

EXTRAE:
- Nombre del material/componente (descripción técnica).
- Fabricante o marca (Schneider, SKF, EAO, Festo, etc.).
- Referencia de fabricante o modelo (ej: ZB5AS934, 6204-2RS, ZEN-L1121).
- Medidas, voltajes, especificaciones técnicas relevantes.
- Cantidades cuando aparezcan asociadas a un material.

IGNORA SIEMPRE:
- Números de OCC, aviso, pedido, solicitud, orden.
- Códigos SAP de relleno tipo 599000000 / 0000000599000000.
- Nombres de usuario, firmas, fechas, saludos, "Empresa:", "Tipo:", "Orden:".
- Comentarios humanos ("urgente", "cuando me lleguen las otras", "para mañana").
- URLs, enlaces, cabeceras de email, "Avisos iOCC", "Enlace directo a la OCC".

FORMATO DE SALIDA:
Devuelve el texto tal cual lo ves útil, en una sola línea o varias, conservando las cantidades junto al material. Si no hay nada identificable como material, devuelve cadena vacía.`

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType } = await req.json()

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: OCR_PROMPT },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    })

    const text = response.choices[0]?.message?.content || ''
    return NextResponse.json({ text })
  } catch (error) {
    console.error('OCR error:', error)
    return NextResponse.json({ error: 'OCR failed' }, { status: 500 })
  }
}
