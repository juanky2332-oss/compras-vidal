'use client'

import { ShoppingCart, Database, Sparkles, Factory, BarChart3, Receipt } from 'lucide-react'

export type Vista = 'asistente' | 'ofertas' | 'secciones' | 'dashboard'

interface HeaderProps {
  marcas: number
  proveedores: number
  saps: number
  vista: Vista
  onVista: (v: Vista) => void
}

const TABS: Array<{ id: Vista; label: string; icon: typeof Sparkles; color: string }> = [
  { id: 'asistente', label: 'Asistente', icon: Sparkles, color: '#a5b4fc' },
  { id: 'ofertas', label: 'Ofertas SAP', icon: Receipt, color: '#5eead4' },
  { id: 'secciones', label: 'Secciones', icon: Factory, color: '#6ee7b7' },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, color: '#fcd34d' },
]

export default function Header({ marcas, proveedores, saps, vista, onVista }: HeaderProps) {
  const listo = saps > 0

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.07] bg-[#070710]/85 backdrop-blur-xl">
      <div className="max-w-4xl lg:max-w-[1160px] mx-auto px-5 h-16 flex items-center justify-between gap-3">
        {/* Logo */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 flex-shrink-0">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <div className="hidden md:flex items-baseline gap-2 min-w-0">
            <span className="text-base font-semibold text-white/92 tracking-tight whitespace-nowrap">Compras Vidal</span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide whitespace-nowrap"
              style={{ background: 'rgba(99,102,241,0.15)', color: 'rgba(165,180,252,0.8)' }}
            >
              Grupo · IA
            </span>
          </div>
        </div>

        {/* Navegación principal — siempre visible */}
        <nav className="flex items-center gap-1 p-1 rounded-xl border border-white/08" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {TABS.map((t) => {
            const activo = vista === t.id
            return (
              <button
                key={t.id}
                onClick={() => onVista(t.id)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-all whitespace-nowrap"
                style={{
                  background: activo ? `${t.color}22` : 'transparent',
                  color: activo ? t.color : 'rgba(255,255,255,0.38)',
                }}
                title={t.label}
              >
                <t.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            )
          })}
        </nav>

        {/* DB status */}
        <div
          className="hidden lg:flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all shrink-0"
          style={{
            background: listo ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)',
            borderColor: listo ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.07)',
          }}
          title={listo ? `Base de datos: ${saps.toLocaleString('es-ES')} SAPs · ${marcas} marcas · ${proveedores} proveedores` : 'Cargando base de datos…'}
        >
          <Database
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: listo ? '#34d399' : 'rgba(255,255,255,0.3)' }}
          />
          <span
            className="text-xs font-medium whitespace-nowrap"
            style={{ color: listo ? 'rgba(52,211,153,0.9)' : 'rgba(255,255,255,0.3)' }}
          >
            {listo
              ? `${saps.toLocaleString('es-ES')} SAPs · ${proveedores} prov.`
              : 'Cargando…'}
          </span>
        </div>
      </div>
    </header>
  )
}
