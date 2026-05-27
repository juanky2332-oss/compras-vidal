import { NextResponse } from 'next/server'
import { getDbStats } from '@/lib/dbLoader'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stats = getDbStats()
    return NextResponse.json(stats)
  } catch (error) {
    console.error('dbstats error:', error)
    return NextResponse.json({ marcas: 0, proveedores: 0, saps: 0 }, { status: 500 })
  }
}
