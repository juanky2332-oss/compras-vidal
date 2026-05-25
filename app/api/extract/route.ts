import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `Eres un extractor de materiales industriales para el departamento de compras de Vidal Golosinas.

Recibes texto crudo de: OCR de fotos, capturas de avisos iOCC, mensajes de texto, emails, descripciones de operarios de mantenimiento.

Tu ÚNICA tarea: identificar QUÉ MATERIALES FÍSICOS hay que comprar, con su CANTIDAD, y devolverlos limpios.

FORMATO TÍPICO DE AVISOS iOCC:
"OCC XXXXX - MATERIAL_A - CANTIDAD_A - MATERIAL_B - CANTIDAD_B - 0000000599000000 - MATERIAL_C - CANTIDAD_C"
El número que sigue a un material es su cantidad. El 599000000 es un código SAP genérico de relleno: ignóralo, NO es material.

REGLAS:
- Cada material lleva: descripción técnica limpia (con referencia de fabricante si la tiene) + cantidad.
- Si la cantidad no aparece o no es identificable, usa 1.
- Normaliza la descripción: minúsculas naturales, conserva referencias/medidas tal cual (NW 65, 1/2", ZB5AS934, 6204-2RS, etc.).
- Si un material aparece como "código X" pero el contexto deja claro que es "codo X" (típico error OCR), corrige.
- IGNORA SIEMPRE: números de OCC/aviso/orden/solicitud, códigos SAP 599000000 / 000...599000000, nombres de usuarios, "Empresa:", "Tipo:", "Orden:", firmas, fechas, saludos, URLs, enlaces, comentarios humanos.
- Si NO hay materiales identificables, devuelve materiales: [].
- NO inventes nada.

SALIDA JSON ESTRICTO (sin texto antes ni después):
{
  "materiales": [
    { "descripcion": "string", "cantidad": number }
  ]
}

EJEMPLO:
Entrada:
"OCC 88320 - punteras conicas 1/2" inox - 8 - machones conicos 1/2" inox - 8 - barra de tubo inox NW 65 - 1 - 0000000000599000000 - codigo 90º NW65 - 1"

Salida:
{ "materiales": [
  { "descripcion": "punteras cónicas 1/2\\" inox", "cantidad": 8 },
  { "descripcion": "machones cónicos 1/2\\" inox", "cantidad": 8 },
  { "descripcion": "barra de tubo inox NW 65", "cantidad": 1 },
  { "descripcion": "codo 90º inox NW 65", "cantidad": 1 }
]}`

export async function POST(req: NextRequest) {
  try {
    const { consulta } = await req.json()

    if (!consulta?.trim()) {
      return NextResponse.json({ materiales: [] })
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Texto recibido:\n"""\n${consulta}\n"""\n\nExtrae los materiales reales con su cantidad según las reglas. Devuelve el JSON.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0,
    })

    const content = response.choices[0]?.message?.content || '{"materiales":[]}'
    const parsed = JSON.parse(content)

    const materiales = (parsed.materiales || [])
      .map((m: { descripcion?: string; material?: string; cantidad?: number }) => ({
        descripcion: String(m.descripcion || m.material || '').trim(),
        cantidad: Number(m.cantidad) > 0 ? Number(m.cantidad) : 1,
      }))
      .filter((m: { descripcion: string }) => m.descripcion.length >= 2)

    return NextResponse.json({ materiales })
  } catch (error) {
    console.error('Extract error:', error)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
