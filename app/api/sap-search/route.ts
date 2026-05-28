import { NextRequest, NextResponse } from 'next/server'
import { loadDb } from '@/lib/dbLoader'
import type { SapSearchResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s\/\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SINONIMOS: Record<string, string[]> = {
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
}

// Tabla DN/NW ↔ pulgadas para expandir búsquedas ("nw50" → también busca "2")
const TABLA_DN = [
  { dn: 6,  pulg: 0.125, corta: '1/8'  },
  { dn: 8,  pulg: 0.25,  corta: '1/4'  },
  { dn: 10, pulg: 0.375, corta: '3/8'  },
  { dn: 15, pulg: 0.5,   corta: '1/2'  },
  { dn: 20, pulg: 0.75,  corta: '3/4'  },
  { dn: 25, pulg: 1.0,   corta: '1'    },
  { dn: 32, pulg: 1.25,  corta: '1-1/4'},
  { dn: 40, pulg: 1.5,   corta: '1-1/2'},
  { dn: 50, pulg: 2.0,   corta: '2'    },
  { dn: 65, pulg: 2.5,   corta: '2-1/2'},
  { dn: 80, pulg: 3.0,   corta: '3'    },
  { dn: 100,pulg: 4.0,   corta: '4'    },
  { dn: 125,pulg: 5.0,   corta: '5'    },
  { dn: 150,pulg: 6.0,   corta: '6'    },
]

function expandirSinonimos(tokens: string[]): string[] {
  const result = [...tokens]
  for (const t of tokens) {
    const syns = SINONIMOS[t] ?? []
    for (const s of syns) {
      if (!result.includes(s)) result.push(s)
    }
  }
  return result
}

// Expande tokens con equivalencias DN/NW↔pulgadas
function expandirMedidas(tokens: string[]): string[] {
  const extra: string[] = []
  const texto = tokens.join(' ')

  // Detectar "nwXX" o "dnXX" → añadir equivalente en pulgadas
  const mDN = texto.match(/\b(?:nw|dn)[\s\-]?(\d{1,4})\b/gi) ?? []
  for (const m of mDN) {
    const num = parseInt(m.replace(/[^\d]/g, ''))
    const fila = TABLA_DN.find((r) => r.dn === num)
    if (fila) {
      extra.push(fila.corta, String(fila.dn), `nw${num}`, `nw ${num}`, `nw-${num}`, `dn${num}`, `dn ${num}`, `dn-${num}`)
    }
  }

  // Detectar pulgadas (número suelto que coincida con una fila) → añadir DN equivalente
  for (const t of tokens) {
    const pDec = parseFloat(t.replace(',', '.'))
    if (!isNaN(pDec)) {
      const fila = TABLA_DN.find((r) => Math.abs(r.pulg - pDec) < 0.02)
      if (fila) {
        extra.push(String(fila.dn), `nw${fila.dn}`, `nw ${fila.dn}`, `nw-${fila.dn}`, `dn${fila.dn}`, `dn ${fila.dn}`)
      }
    }
  }

  return [...new Set([...tokens, ...extra])]
}

export async function POST(req: NextRequest) {
  const { query } = await req.json()
  if (!query || query.length < 2) return NextResponse.json([])

  const db = loadDb()
  const q = norm(query).trim()

  const isCodeSearch = /^\d{3,}/.test(q.replace(/\s/g, ''))

  let results: SapSearchResult[]

  if (isCodeSearch) {
    const codeQ = q.replace(/\s/g, '')
    results = db.sapHistorico
      .filter((s) => !s['Código SAP'].startsWith('59900'))
      .filter((s) => s['Código SAP'].includes(codeQ))
      .map((s) => ({
        codigo: s['Código SAP'],
        descripcion: s['Descripción Material'],
        proveedor: s['Nombre Proveedor PRINCIPAL'],
        veces: Number(s['Veces Comprado']) || 0,
      }))
      .sort((a, b) => b.veces - a.veces)
      .slice(0, 15)
  } else {
    const baseTokens = q.split(/\s+/).filter((t) => t.length >= 2)
    const tokens = expandirMedidas(expandirSinonimos(baseTokens))

    if (tokens.length === 0) return NextResponse.json([])

    results = db.sapHistorico
      .filter((s) => !s['Código SAP'].startsWith('59900'))
      .map((s) => {
        const d = norm(s['Descripción Material'])
        const matches = tokens.filter((t) => d.includes(t)).length
        const freq = Math.log(Number(s['Veces Comprado']) + 1)
        return { s, score: matches * 10 + freq }
      })
      .filter(({ score }) => score >= 10)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(({ s }) => ({
        codigo: s['Código SAP'],
        descripcion: s['Descripción Material'],
        proveedor: s['Nombre Proveedor PRINCIPAL'],
        veces: Number(s['Veces Comprado']) || 0,
      }))
  }

  return NextResponse.json(results)
}
