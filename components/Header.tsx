'use client'

import { ShoppingCart, Database } from 'lucide-react'

interface HeaderProps {
  marcas: number
  proveedores: number
  saps: number
}

export default function Header({ marcas, proveedores, saps }: HeaderProps) {
  const listo = saps > 0

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.06] bg-[#08080f]/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ShoppingCart className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-white/90 tracking-tight">Compras Vidal</span>
            <span className="text-xs text-white/30 font-medium">IA</span>
          </div>
        </div>

        {/* DB status */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200"
            style={{
              background: listo ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.03)',
              borderColor: listo ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)',
            }}
          >
            <Database
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: listo ? '#10b981' : 'rgba(255,255,255,0.3)' }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: listo ? '#10b981' : 'rgba(255,255,255,0.3)' }}
            >
              {listo
                ? `${saps.toLocaleString('es-ES')} SAPs · ${marcas} marcas · ${proveedores} proveedores`
                : 'Cargando base de datos…'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
