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
  Target,
  GitCompare,
  Puzzle,
  HelpCircle,
} from 'lucide-react'
import type { RecomendacionNueva, TipoMatch } from '@/lib/types'

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
    bg: 'rgba(16,185,129,0.07)',
    border: 'rgba(16,185,129,0.22)',
    glow: 'rgba(16,185,129,0.14)',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  MEDIO: {
    label: 'MEDIO',
    icon: AlertTriangle,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.22)',
    glow: 'rgba(245,158,11,0.12)',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  BAJO: {
    label: 'BAJO',
    icon: XCircle,
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.05)',
    border: 'rgba(239,68,68,0.2)',
    glow: 'rgba(239,68,68,0.1)',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
}

const MATCH_CONFIG: Record<TipoMatch, { label: string; icon: typeof Target; style: string; title: string }> = {
  EXACTO: {
    label: 'Match exacto',
    icon: Target,
    style: 'bg-emerald-500/12 text-emerald-300/90 border-emerald-500/25',
    title: 'Artículo encontrado con referencia/medida exacta en la base de datos',
  },
  PARCIAL: {
    label: 'Artículo similar',
    icon: GitCompare,
    style: 'bg-sky-500/12 text-sky-300/90 border-sky-500/25',
    title: 'Artículo similar encontrado — la medida o referencia puede no ser idéntica, verifica antes de pedir',
  },
  EQUIVALENTE: {
    label: 'Equivalente técnico',
    icon: Puzzle,
    style: 'bg-violet-500/12 text-violet-300/90 border-violet-500/25',
    title: 'No hay SAP con esa referencia exacta — se propone equivalente técnico por características (potencia, tipo, dimensiones)',
  },
  SIN_MATCH: {
    label: 'Sin match directo',
    icon: HelpCircle,
    style: 'bg-red-500/10 text-red-300/80 border-red-500/20',
    title: 'No se encontró artículo ni equivalente claro — confirma con el responsable antes de pedir',
  },
}

const PASO_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Marca reconocida', color: 'text-violet-400/65' },
  2: { label: 'Tipo de material', color: 'text-indigo-400/65' },
  3: { label: 'Match por código SAP', color: 'text-emerald-400/65' },
  4: { label: 'Categoría general', color: 'text-amber-400/65' },
  5: { label: 'Sin coincidencia — solicita más datos', color: 'text-red-400/65' },
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
  const hayDetalle = tieneAlternativas || tieneSAPs || tieneObservaciones
  const matchCfg = rec.tipoMatch ? MATCH_CONFIG[rec.tipoMatch] : null

  return (
    <div
      className="rounded-2xl border transition-all duration-200 overflow-hidden animate-slide-up"
      style={{
        background: rec.seleccionado ? cfg.bg : 'rgba(255,255,255,0.018)',
        borderColor: rec.seleccionado ? cfg.border : 'rgba(255,255,255,0.07)',
        boxShadow: rec.seleccionado ? `0 0 32px ${cfg.glow}` : '0 2px 12px rgba(0,0,0,0.25)',
        animationDelay: `${index * 55}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Card body */}
      <div className="p-5">
        <div className="flex items-start gap-3.5">
          {/* Checkbox */}
          <button
            onClick={() => onToggle(index)}
            className="mt-0.5 flex-shrink-0 transition-colors"
            title="Incluir en exportación SAP"
          >
            {rec.seleccionado ? (
              <CheckSquare className="w-5 h-5" style={{ color: cfg.color }} />
            ) : (
              <Square className="w-5 h-5 text-white/20" />
            )}
          </button>

          <div className="flex-1 min-w-0 space-y-2.5">
            {/* Nombre + badges */}
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-white/92 leading-snug">
                {rec.material_detectado}
              </h3>
              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                {matchCfg && (
                  <span
                    className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${matchCfg.style}`}
                    title={matchCfg.title}
                  >
                    <matchCfg.icon className="w-2.5 h-2.5" />
                    {matchCfg.label}
                  </span>
                )}
                <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
                  <ConfIcon className="w-3 h-3" />
                  {cfg.label}
                </span>
              </div>
            </div>

            {/* Tipo + Marca */}
            {((rec.tipo_material && rec.tipo_material !== 'No clasificado') || (rec.marca_detectada && rec.marca_detectada !== 'no especificada')) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {rec.tipo_material && rec.tipo_material !== 'No clasificado' && (
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-white/22 flex-shrink-0" />
                    <span className="text-sm text-white/45">{rec.tipo_material}</span>
                  </div>
                )}
                {rec.marca_detectada && rec.marca_detectada !== 'no especificada' && (
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-violet-400/45 flex-shrink-0" />
                    <span className="text-sm text-violet-300/65 font-medium">{rec.marca_detectada}</span>
                  </div>
                )}
              </div>
            )}

            {/* Proveedor recomendado */}
            {proveedor?.nombre && proveedor.nombre !== 'Sin datos' && (
              <div
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <Building2 className="w-4 h-4 text-white/30 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-white/85">{proveedor.nombre}</span>
                  {proveedor.codigo && (
                    <span className="ml-2 text-xs text-white/38 font-mono">{proveedor.codigo}</span>
                  )}
                </div>
              </div>
            )}

            {/* Motivo */}
            {rec.motivo && (
              <p className="text-sm text-white/38 leading-relaxed">{rec.motivo}</p>
            )}

            {/* Paso determinante */}
            <p className={`text-xs ${paso.color}`}>{paso.label}</p>
          </div>
        </div>
      </div>

      {/* Expandible */}
      {hayDetalle && (
        <>
          <button
            onClick={() => setExpandido(!expandido)}
            className="w-full flex items-center justify-between px-5 py-2.5 border-t border-white/[0.06] hover:bg-white/[0.025] transition-colors"
          >
            <span className="text-sm text-white/32 hover:text-white/55 transition-colors">
              {[
                tieneAlternativas && `${rec.alternativas.length} alternativa${rec.alternativas.length > 1 ? 's' : ''}`,
                tieneSAPs && `${rec.codigos_sap_sugeridos.length} código${rec.codigos_sap_sugeridos.length > 1 ? 's' : ''} SAP`,
                tieneObservaciones && 'Observaciones',
              ].filter(Boolean).join(' · ')}
            </span>
            {expandido
              ? <ChevronUp className="w-4 h-4 text-white/30" />
              : <ChevronDown className="w-4 h-4 text-white/30" />
            }
          </button>

          {expandido && (
            <div className="px-5 pb-5 pt-3 space-y-4 border-t border-white/[0.04]">
              {/* Alternativas */}
              {tieneAlternativas && (
                <div>
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2.5">Alternativas</p>
                  <div className="space-y-2">
                    {rec.alternativas.slice(0, 3).map((alt, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <Building2 className="w-3.5 h-3.5 text-white/22 flex-shrink-0" />
                        <span className="text-sm text-white/55 font-medium flex-1">{alt.nombre}</span>
                        {alt.codigo && (
                          <code className="text-xs text-white/32 bg-white/04 border border-white/07 px-1.5 py-0.5 rounded-md font-mono">
                            {alt.codigo}
                          </code>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SAPs sugeridos */}
              {tieneSAPs && (
                <div>
                  <div className="flex items-center justify-between mb-2.5 gap-2">
                    <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">Códigos SAP sugeridos</p>
                    {rec.leyendaMedidas && (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: 'rgba(165,180,252,0.85)' }}
                        title="Conversión de medidas aplicada en la búsqueda"
                      >
                        {rec.leyendaMedidas}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {rec.codigos_sap_sugeridos.slice(0, 5).map((sap, i) => {
                      const esCatalogo = !sap.proveedor && !!sap.nota?.includes('sin historial')
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-3 px-3.5 py-2 rounded-lg"
                          style={{
                            background: esCatalogo ? 'rgba(245,158,11,0.04)' : 'rgba(99,102,241,0.05)',
                            border: `1px solid ${esCatalogo ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.12)'}`,
                          }}
                        >
                          <Hash className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${esCatalogo ? 'text-amber-400/45' : 'text-indigo-400/50'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className={`text-sm font-mono font-medium ${esCatalogo ? 'text-amber-300/80' : 'text-indigo-300/85'}`}>{sap.codigo}</code>
                              {esCatalogo
                                ? <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase"
                                    style={{ background: 'rgba(245,158,11,0.12)', color: 'rgba(251,191,36,0.7)', border: '1px solid rgba(245,158,11,0.2)' }}>SAP</span>
                                : sap.proveedor && <span className="text-xs text-white/38">{sap.proveedor}</span>
                              }
                              {sap.aproximado && <span className="text-[10px] text-amber-400/60">~aprox.</span>}
                            </div>
                            <p className="text-xs text-white/28 italic mt-0.5 truncate">{sap.descripcion}</p>
                            {esCatalogo && <p className="text-[9px] text-amber-400/40 mt-0.5">Sin historial de compra — existe en SAP</p>}
                            {sap.nota && !esCatalogo && <p className="text-xs text-amber-400/50 mt-0.5 leading-tight">{sap.nota}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Observaciones */}
              {tieneObservaciones && (
                <div
                  className="flex gap-3 p-3.5 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.14)' }}
                >
                  <Lightbulb className="w-4 h-4 text-amber-400/65 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-white/50 leading-relaxed">{rec.observaciones}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
