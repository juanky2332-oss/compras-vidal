import { NextResponse } from 'next/server'
import { loadDb } from '@/lib/dbLoader'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = loadDb()
  const proveedores = db.proveedores.map((p) => ({
    codigo: p['Código Proveedor'],
    nombre: p['Nombre Proveedor'],
  }))
  return NextResponse.json(proveedores)
}
