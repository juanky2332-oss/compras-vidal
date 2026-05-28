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
    const baseTokens = q.split(/\s+/).filter((t) => t.length >= 3)
    const tokens = expandirSinonimos(baseTokens)

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
