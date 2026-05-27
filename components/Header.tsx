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
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.07] bg-[#070710]/85 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 flex-shrink-0">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-white/92 tracking-tight">Compras Vidal</span>
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded-md"
              style={{ background: 'rgba(99,102,241,0.15)', color: 'rgba(165,180,252,0.8)' }}
            >
              IA
            </span>
          </div>
        </div>

        {/* DB status */}
        <div
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all"
          style={{
            background: listo ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)',
            borderColor: listo ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.07)',
          }}
        >
          <Database
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: listo ? '#34d399' : 'rgba(255,255,255,0.3)' }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: listo ? 'rgba(52,211,153,0.9)' : 'rgba(255,255,255,0.3)' }}
          >
            {listo
              ? `${saps.toLocaleString('es-ES')} SAPs · ${marcas} marcas · ${proveedores} proveedores`
              : 'Cargando…'}
          </span>
        </div>
      </div>
    </header>
  )
}
