'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Building2,
  Hash,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Lightbulb,
  Tag,
  Layers,
} from 'lucide-react'
import type { RecomendacionNueva } from '@/lib/types'

interface MaterialCardProps {
  rec: RecomendacionNueva
  index: number
  onToggle: (index: number) => void
}

const CONFIDENCE_CONFIG = {
  ALTO: {
    label: 'ALTO',
    icon: CheckCircle2,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.06)',
    border: 'rgba(16,185,129,0.2)',
    glow: 'rgba(16,185,129,0.12)',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  MEDIO: {
    label: 'MEDIO',
    icon: AlertTriangle,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.05)',
    border: 'rgba(245,158,11,0.2)',
    glow: 'rgba(245,158,11,0.1)',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  BAJO: {
    label: 'BAJO',
    icon: XCircle,
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.04)',
    border: 'rgba(239,68,68,0.18)',
    glow: 'rgba(239,68,68,0.08)',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
}

const PASO_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Marca detectada', color: 'text-violet-400/70' },
  2: { label: 'Tipo de material', color: 'text-indigo-400/70' },
  3: { label: 'SAP match', color: 'text-emerald-400/70' },
  4: { label: 'Fallback categoría', color: 'text-amber-400/70' },
  5: { label: 'Sin match — pedir aclaración', color: 'text-red-400/70' },
}

export default function MaterialCard({ rec, index, onToggle }: MaterialCardProps) {
  const [expandido, setExpandido] = useState(false)
  const cfg = CONFIDENCE_CONFIG[rec.nivel_confianza]
  const ConfIcon = cfg.icon
  const proveedor = rec.proveedor_recomendado
  const tieneAlternativas = rec.alternativas?.length > 0
  const tieneSAPs = rec.codigos_sap_sugeridos?.length > 0
  const tieneObservaciones = !!rec.observaciones?.trim()
  const paso = PASO_LABELS[rec._pasoDeterminante] || PASO_LABELS[5]

  return (
    <div
      className="rounded-2xl border transition-all duration-200 animate-slide-up overflow-hidden"
      style={{
        background: rec.seleccionado ? cfg.bg : 'rgba(255,255,255,0.015)',
        borderColor: rec.seleccionado ? cfg.border : 'rgba(255,255,255,0.06)',
        boxShadow: rec.seleccionado ? `0 0 30px ${cfg.glow}` : 'none',
        animationDelay: `${index * 60}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            onClick={() => onToggle(index)}
            className="mt-0.5 flex-shrink-0 transition-colors"
            title="Incluir en exportación SAP"
          >
            {rec.seleccionado ? (
              <CheckSquare className="w-4.5 h-4.5" style={{ color: cfg.color }} />
            ) : (
              <Square className="w-4.5 h-4.5 text-white/20" />
            )}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Material name + confidence */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-white/90 leading-snug">
                {rec.material_detectado}
              </h3>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                  <ConfIcon className="w-2.5 h-2.5 inline mr-1 -mt-px" />
                  {cfg.label}
                </span>
              </div>
            </div>

            {/* Tipo material + marca */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
              {rec.tipo_material && rec.tipo_material !== 'No clasificado' && (
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-white/20 flex-shrink-0" />
                  <span className="text-xs text-white/40">{rec.tipo_material}</span>
                </div>
              )}
              {rec.marca_detectada && rec.marca_detectada !== 'no especificada' && (
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-violet-400/40 flex-shrink-0" />
                  <span className="text-xs text-violet-300/60">{rec.marca_detectada}</span>
                </div>
              )}
            </div>

            {/* Provider + SAP */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {proveedor?.nombre && proveedor.nombre !== 'Sin datos' && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-white/25 flex-shrink-0" />
                  <span className="text-xs text-white/70 font-medium">{proveedor.nombre}</span>
                  {proveedor.codigo && (
                    <code className="text-xs text-white/35 font-mono">{proveedor.codigo}</code>
                  )}
                </div>
              )}
            </div>

            {/* Motivo */}
            {rec.motivo && (
              <p className="mt-2 text-xs text-white/35 leading-relaxed">{rec.motivo}</p>
            )}

            {/* Paso determinante */}
            <p className={`mt-1.5 text-xs ${paso.color}`}>
              Paso {rec._pasoDeterminante}: {paso.label}
            </p>
          </div>
        </div>
      </div>

      {/* Expandible */}
      {(tieneAlternativas || tieneSAPs || tieneObservaciones) && (
        <>
          <button
            onClick={() => setExpandido(!expandido)}
            className="w-full flex items-center justify-between px-4 py-2 border-t border-white/[0.05] hover:bg-white/[0.02] transition-colors text-xs text-white/30 hover:text-white/50"
          >
            <span>
              {tieneAlternativas ? `${rec.alternativas.length} alternativa${rec.alternativas.length > 1 ? 's' : ''}` : ''}
              {tieneAlternativas && tieneSAPs ? ' · ' : ''}
              {tieneSAPs ? `${rec.codigos_sap_sugeridos.length} SAP${rec.codigos_sap_sugeridos.length > 1 ? 's' : ''}` : ''}
              {(tieneAlternativas || tieneSAPs) && tieneObservaciones ? ' · ' : ''}
              {tieneObservaciones ? 'Observaciones' : ''}
            </span>
            {expandido ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expandido && (
            <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/[0.04]">
              {/* Alternativas */}
              {tieneAlternativas && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-white/30">Alternativas:</p>
                  {rec.alternativas.slice(0, 3).map((alt, i) => (
                    <div key={i} className="pl-3 border-l border-white/08 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs text-white/50 font-medium">{alt.nombre}</span>
                        {alt.codigo && (
                          <code className="text-xs text-white/35 bg-white/04 border border-white/08 px-1.5 py-0.5 rounded-md font-mono">
                            {alt.codigo}
                          </code>
                        )}
                      </div>
                      {alt.nota && <p className="text-xs text-white/30">{alt.nota}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* SAPs sugeridos */}
              {tieneSAPs && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-white/30">Códigos SAP sugeridos:</p>
                  {rec.codigos_sap_sugeridos.slice(0, 4).map((sap, i) => (
                    <div key={i} className="pl-3 border-l border-indigo-500/20 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <code className="text-xs text-indigo-300/80 bg-indigo-500/08 border border-indigo-500/15 px-1.5 py-0.5 rounded-md font-mono">
                          {sap.codigo}
                        </code>
                        <span className="text-xs text-white/35">{sap.proveedor}</span>
                      </div>
                      <p className="text-xs text-white/25 italic">{sap.descripcion}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Observaciones */}
              {tieneObservaciones && (
                <div className="flex gap-2 p-3 rounded-lg bg-white/[0.025] border border-white/[0.06]">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0 mt-px" />
                  <p className="text-xs text-white/45 leading-relaxed">{rec.observaciones}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
