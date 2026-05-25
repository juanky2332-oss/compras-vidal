'use client'

import { ShoppingCart, Database, ChevronRight } from 'lucide-react'

interface HeaderProps {
  historicoCargado: boolean
  filas: number
  onOpenSetup: () => void
}

export default function Header({ historicoCargado, filas, onOpenSetup }: HeaderProps) {
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

        {/* Histórico status */}
        <button
          onClick={onOpenSetup}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 group"
          style={{
            background: historicoCargado
              ? 'rgba(16,185,129,0.06)'
              : 'rgba(255,255,255,0.03)',
            borderColor: historicoCargado
              ? 'rgba(16,185,129,0.2)'
              : 'rgba(255,255,255,0.07)',
          }}
        >
          <Database
            className="w-3.5 h-3.5"
            style={{ color: historicoCargado ? '#10b981' : 'rgba(255,255,255,0.3)' }}
          />
          <span
            className="text-xs font-medium"
            style={{ color: historicoCargado ? 'rgba(16,185,129,0.9)' : 'rgba(255,255,255,0.4)' }}
          >
            {historicoCargado ? `${filas.toLocaleString('es-ES')} filas cargadas` : 'Cargar histórico'}
          </span>
          <ChevronRight className="w-3 h-3 text-white/20 group-hover:text-white/40 transition-colors" />
        </button>
      </div>
    </header>
  )
}
